import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createApplicationLogger, createApplicationLogStore, createControlRoomLogger, logEvent } from "./application-log-store.mjs";
import { createDemoRuntime } from "./offline-runtime.mjs";
import { createProviderSettingsService } from "./provider-settings.mjs";
import { createControlRoomManager } from "./control-room-manager.mjs";
import { compassDataPath, resolveCompassDataRoot } from "./data-root.mjs";

// Re-exported: createDemoRuntime's implementation moved to offline-runtime.mjs
// (control-room-manager.mjs needs it too, and importing it from server.mjs
// would create a circular dependency), but existing tests import it from here.
export { createDemoRuntime };

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const frontendRoot = join(projectRoot, "frontend");
const port = Number(process.env.COMPASS_PORT ?? process.env.PORT ?? 3000);
const host = process.env.COMPASS_HOST ?? "0.0.0.0";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true; // lets a caller distinguish "a response was written" from "nothing matched"
}

function requestErrorStatus(error, fallbackStatus) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : fallbackStatus;
}

function mutationResponse(response, result) {
  const conflict = ["CONFLICT", "GATED"].includes(result?.action?.status) ? result.action : null;
  return conflict ? sendJson(response, 409, { error: conflict.reason, code: conflict.reason, conflict }) : sendJson(response, 200, result);
}

/**
 * Requests that arrive through the Cloudflare Tunnel carry Cf-Connecting-IP: Cloudflare's edge
 * sets it, and a visitor can neither remove nor forge its absence. Requests from the host
 * or the LAN (http://<host>:3200) do not. Provider settings are deployment-wide and hold the
 * shared API key, so tunnel visitors may read them but not change them, unless the operator
 * sets COMPASS_PUBLIC_SETTINGS=editable (for a tunnel already behind Cloudflare Access).
 */
function settingsEditable(request, publicSettingsEditable) {
  return publicSettingsEditable || !request.headers["cf-connecting-ip"];
}

export function publicSettingsEditableFromEnv(value = process.env.COMPASS_PUBLIC_SETTINGS) {
  if (value === undefined || value === "" || value === "read-only") return false;
  if (value === "editable") return true;
  throw new Error('COMPASS_PUBLIC_SETTINGS must be "read-only" or "editable"');
}

const SETTINGS_READ_ONLY = { error: "Provider settings are read-only on the public demo", code: "SETTINGS_READ_ONLY" };

// A room URL (/rooms/:id) has no matching file on disk — it's a client-side
// route the frontend parses from location.pathname at boot (see
// Control_Rooms_SOW_v1_DRAFT.md §4.5) — so serve the same index.html rather
// than 404ing on a page reload or a direct link to a specific room. The same
// page serves a room's wall-display screens (/rooms/:id/display/:screen).
const ROOM_PAGE_PATTERN = /^\/rooms\/[^/]+(?:\/display\/[a-z]+)?\/?$/;

/**
 * A hash of the app's own frontend files, appended as ?v= to every reference to them in
 * index.html and in module imports. Each deploy therefore asks for URLs no browser or
 * Cloudflare cache has seen, whatever the zone's cache settings, while unchanged files keep
 * their URL. Computed once per process: the image's files cannot change while it runs.
 */
let assetVersion = null;
function frontendAssetVersion() {
  assetVersion ??= (async () => {
    const hash = createHash("sha256");
    const names = (await readdir(frontendRoot)).filter((name) => /\.(html|css|js)$/.test(name)).sort();
    for (const name of names) hash.update(name).update(await readFile(join(frontendRoot, name)));
    return hash.digest("hex").slice(0, 12);
  })();
  return assetVersion;
}

async function versionReferences(filePath, contents) {
  const extension = extname(filePath);
  if (filePath.includes(`${frontendRoot}/vendor/`) || (extension !== ".html" && extension !== ".js")) return contents;
  const version = await frontendAssetVersion();
  const text = contents.toString("utf8");
  return extension === ".html"
    ? text.replace(/(href|src)="\/(?!vendor\/)([\w.-]+\.(?:css|js))"/g, `$1="/$2?v=${version}"`)
    : text.replace(/(from\s+["'])(\.\/[\w.-]+\.js)(["'])/g, `$1$2?v=${version}$3`);
}

async function serveStatic(pathname, response) {
  const requestedPath = pathname === "/" || ROOM_PAGE_PATTERN.test(pathname) ? "/index.html" : pathname;
  const filePath = normalize(join(frontendRoot, requestedPath));
  if (!filePath.startsWith(`${frontendRoot}/`)) return sendJson(response, 404, { error: "Not found" });
  try {
    const contents = await versionReferences(filePath, await readFile(filePath));
    // The app's pages and scripts change with every deploy and have no fingerprinted names,
    // so a browser or Cloudflare must revalidate them rather than serve a stale copy
    // (Cloudflare otherwise applies a 4-hour browser TTL). Fonts and vendored files never change.
    const cacheControl = filePath.includes(`${frontendRoot}/vendor/`) ? "public, max-age=604800, immutable" : "no-cache";
    response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream", "cache-control": cacheControl });
    response.end(contents);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

function assertRoomMutationRequest(request) {
  const origin=request.headers.origin;
  const protocol=request.headers['x-forwarded-proto'] ?? (request.socket?.encrypted?'https':'http');
  if (origin !== undefined) {
    let same=false;
    try {
      const parsed=new URL(origin),expected=new URL(`${protocol}://${request.headers.host}`);
      same=['http:','https:'].includes(parsed.protocol)&&parsed.origin===origin&&parsed.origin===expected.origin;
    } catch { /* null, malformed or multiple origins fail closed */ }
    if(!same)throw Object.assign(new Error('Cross-origin room mutation rejected'),{statusCode:403,code:'CROSS_ORIGIN_MUTATION'});
  }
  const type=request.headers['content-type'];
  if(typeof type!=='string'||type.split(';')[0].trim().toLowerCase()!=='application/json')
    throw Object.assign(new Error('Room mutations require application/json'),{statusCode:415,code:'JSON_CONTENT_TYPE_REQUIRED'});
}
async function readJsonBody(request, maxLength = 2000) {
  const chunks=[];let size=0;
  for await (const chunk of request) {
    const bytes=Buffer.from(chunk);size+=bytes.length;
    if (size > maxLength) throw Object.assign(new Error('Request body is too large'),{statusCode:413,code:'REQUEST_TOO_LARGE'});
    chunks.push(bytes);
  }
  const body=Buffer.concat(chunks).toString('utf8');
  try {return body ? JSON.parse(body) : {};}
  catch {throw Object.assign(new Error('Invalid JSON request body'),{statusCode:400,code:'INVALID_JSON'});}
}

/**
 * Every room-scoped route body, unchanged from the single-instance design
 * except that `runtime` is now whichever room the URL resolved to instead of
 * a module-level singleton. `path` is the request path with the
 * `/api/control-rooms/:id` prefix already stripped (so this still reads
 * "/state", "/issues/:id/raise", etc. — the same literals as before the
 * prefix existed).
 */
async function handleRoomScopedRoute({ request, response, path, runtime, logger, url, roomId }) {
  if (request.method === 'POST' && path === '/ask') return sendJson(response,200,await runtime.ask(await readJsonBody(request,4096)));
  const askMatch=/^\/ask\/([^/]+)$/.exec(path);
  if(request.method==='GET'&&askMatch)return sendJson(response,200,await runtime.getAsk(decodeURIComponent(askMatch[1])));
  if (request.method === 'POST' && path === '/reports') return sendJson(response, 202, await runtime.submitReport(await readJsonBody(request, 12000)));
  const reportMatch = /^\/reports\/([^/]+)(?:\/(confirm|close))?$/.exec(path);
  if (reportMatch) {
    const id = decodeURIComponent(reportMatch[1]);
    if (request.method === 'GET' && !reportMatch[2]) return sendJson(response, 200, await runtime.getReport(id));
    if (request.method === 'POST' && reportMatch[2]) return sendJson(response, 200, await runtime[reportMatch[2] === 'confirm' ? 'confirmReport' : 'closeReport'](id, await readJsonBody(request)));
  }
  const investigationMatch = /^\/investigations\/([^/]+)(?:\/(approve|override|reinvestigate|reject|escalate|feedback))?$/.exec(path);
  if (investigationMatch) {
    const id = decodeURIComponent(investigationMatch[1]);
    if (request.method === 'GET' && !investigationMatch[2]) return sendJson(response, 200, await runtime.getInvestigation(id));
    if (request.method === 'POST' && investigationMatch[2] === 'reinvestigate') return sendJson(response, 200, await runtime.reinvestigate(id, await readJsonBody(request)));
    if (request.method === 'POST' && investigationMatch[2]) return sendJson(response, 200, await runtime.decideInvestigation(id, await readJsonBody(request), investigationMatch[2]));
  }
  if (request.method === 'PATCH' && path === '/demo/investigation-policy') return sendJson(response, 200, await runtime.updateInvestigationPolicy(await readJsonBody(request)));
  const caseMatch = /^\/cases\/([^/]+)$/.exec(path);
  if (request.method === 'GET' && caseMatch) return sendJson(response, 200, await runtime.getCase(decodeURIComponent(caseMatch[1])));
  const stationHistoryMatch = /^\/equipment\/([^/]+)\/issues$/.exec(path);
  if (request.method === "GET" && stationHistoryMatch) {
    return sendJson(response, 200, await runtime.stationHistory(decodeURIComponent(stationHistoryMatch[1]), { before: url.searchParams.get("before"), limit: Number(url.searchParams.get("limit") ?? 100) }));
  }
  if (request.method === "GET" && path === "/state") {
    return sendJson(response, 200, await runtime.snapshot());
  }
  if (request.method === "POST" && path === "/reset") {
    return sendJson(response, 200, await runtime.reset());
  }
  if (request.method === "GET" && ["/issues", "/responders", "/events"].includes(path)) {
    if (path === "/issues" && runtime.mode === "LIVE" && runtime.stationHistory) return sendJson(response, 200, await runtime.stationHistory(null, { before: url.searchParams.get("before"), limit: Number(url.searchParams.get("limit") ?? 100) }));
    const state = await runtime.snapshot();
    const key = path === "/issues" ? "issues" : path === "/responders" ? "responders" : "operationalEvents";
    return sendJson(response, 200, { mode: state.mode, simulationTime: state.simulationState?.simulationTime ?? null, [key]: state[key] ?? [] });
  }
  if (request.method === 'GET' && path === '/handler-episodes') return sendJson(response, 200, await runtime.handlerEpisodes());
  if (request.method === 'POST' && ['/handler-alarms', '/handler-runs', '/handler-planned-stops'].includes(path)) return sendJson(response, 200, await runtime.enterHandlerInput({ '/handler-alarms': 'alarms', '/handler-runs': 'runs', '/handler-planned-stops': 'plannedStops' }[path], await readJsonBody(request)));
  if (request.method === 'GET' && path === '/correlation-records') return sendJson(response, 200, await runtime.correlationRecords({ roomId }));
  if (request.method === 'POST' && path === '/correlation-records') return sendJson(response, 200, await runtime.enterCorrelationRecord(await readJsonBody(request)));
  if (request.method === 'POST' && path === '/calibrations') return sendJson(response, 200, await runtime.enterCalibration(await readJsonBody(request)));
  if (request.method === 'GET' && path === '/calibrations') return sendJson(response, 200, await runtime.calibrations({ roomId }));
  if (request.method === 'POST' && path === '/loadboards/boards') return sendJson(response, 200, await runtime.enterLoadboard(await readJsonBody(request)));
  if (request.method === 'POST' && path === '/loadboards/checkout') return sendJson(response, 200, await runtime.checkoutLoadboard(await readJsonBody(request)));
  if (request.method === 'POST' && path === '/loadboards/release') return sendJson(response, 200, await runtime.releaseLoadboard(await readJsonBody(request)));
  if (request.method === 'GET' && path === '/cell-readiness') return sendJson(response, 200, await runtime.cellReadiness({ roomId }));
  if (request.method === 'GET' && path === '/consumable-obligations') return sendJson(response, 200, await runtime.consumableObligations({ roomId }));
  if (request.method === "GET" && path === "/loadboards") return sendJson(response, 200, await runtime.loadboards({ roomId }));
  if (request.method === "GET" && path === "/station-kpis") {
    const params = url.searchParams;
    const badWindow = [...params.keys()].some(key => !['windowEnd', 'stations'].includes(key)) || params.getAll('windowEnd').length > 1;
    const code = badWindow ? 'INVALID_WINDOW' : params.getAll('stations').length > 1 ? 'UNKNOWN_STATION' : null;
    if (code) return sendJson(response, 400, { error: code, code });
    return sendJson(response, 200, await runtime.stationKpis({ roomId, windowEnd: params.get('windowEnd') ?? undefined, stations: params.get('stations') ?? undefined }));
  }
  if (request.method === "GET" && path === "/analytics") {
    return sendJson(response, 200, await runtime.analytics());
  }
  if (request.method === "GET" && path === "/analytics/period") {
    return sendJson(response, 200, await runtime.analyticsPeriod({ level: url.searchParams.get("level") ?? "DAY" }));
  }
  if (request.method === "GET" && path === "/analytics/pareto") {
    return sendJson(response, 200, await runtime.analyticsPareto({ level: url.searchParams.get("level") ?? "MONTH", period: url.searchParams.get("period") }));
  }
  if (request.method === "POST" && path === "/mode") {
    const payload = await readJsonBody(request);
    return sendJson(response, 200, await runtime.setMode(payload.mode));
  }
  if (request.method === "POST" && path === "/simulation/start") {
    return sendJson(response, 200, await runtime.startSimulation());
  }
  if (request.method === "POST" && path === "/simulation/pause") {
    return sendJson(response, 200, await runtime.pauseSimulation());
  }
  if (request.method === "POST" && path === "/simulation/resume") {
    return sendJson(response, 200, await runtime.resumeSimulation());
  }
  if (request.method === "POST" && path === "/simulation/speed") {
    const payload = await readJsonBody(request);
    return sendJson(response, 200, await runtime.setSimulationSpeed(Number(payload.speed)));
  }
  if (request.method === "POST" && path === "/simulation/reset") {
    return sendJson(response, 200, await runtime.reset());
  }
  if (request.method === "POST" && path === "/simulation/force-event") {
    return sendJson(response, 200, await runtime.forceNextEvent());
  }
  if (request.method === "PATCH" && path === "/demo/scenario") {
    const result = await runtime.updateWorkforceScenario(await readJsonBody(request));
    return mutationResponse(response, result);
  }
  const staffingMatch = path.match(/^\/staffing\/([^/]+)\/(approve|reject)$/);
  if (request.method === 'POST' && staffingMatch) {
    const {optionId, reason, expectedRevision} = await readJsonBody(request);
    const result = await runtime.decideStaffing(decodeURIComponent(staffingMatch[1]), {optionId, reason, expectedRevision, decision: staffingMatch[2]});
    if (result.action?.status === 'STALE') return sendJson(response, 409, {error:'Staffing option is stale; nothing applied',code:'STAFFING_STALE',conflict:result.action});
    if (result.action?.status === 'NOT_FOUND') return sendJson(response, 404, {error:'Staffing recommendation not found'});
    if (result.action?.status?.startsWith('INVALID_')) return sendJson(response, 400, {error:result.action.status});
    return mutationResponse(response, result);
  }
  if (request.method === 'PATCH' && path === '/demo/staffing-policy') return mutationResponse(response, await runtime.updateStaffingPolicy(await readJsonBody(request)));
  const issueAuditMatch = path.match(/^\/issues\/([^/]+)\/audit$/);
  if (request.method === "GET" && issueAuditMatch) {
    const record = await runtime.issueAudit(decodeURIComponent(issueAuditMatch[1]));
    return record
      ? sendJson(response, 200, record)
      : sendJson(response, 404, { error: "Issue was not found" });
  }
  const forceResolveMatch = path.match(/^\/issues\/([^/]+)\/force-resolve$/);
  if (request.method === "POST" && forceResolveMatch) {
    return sendJson(response, 200, await runtime.forceResolve(decodeURIComponent(forceResolveMatch[1])));
  }
  const assistanceMatch = path.match(/^\/issues\/([^/]+)\/assistance$/);
  if (request.method === "POST" && assistanceMatch) {
    const result = await runtime.requestAssistance(decodeURIComponent(assistanceMatch[1]));
    return mutationResponse(response, result);
  }
  const releaseMatch = path.match(/^\/issues\/([^/]+)\/responders\/([^/]+)\/release$/);
  if (request.method === "POST" && releaseMatch) {
    const body = await readJsonBody(request);
    const result = await runtime.releaseResponder({ issueId: decodeURIComponent(releaseMatch[1]), responderId: decodeURIComponent(releaseMatch[2]), expectedRosterVersion: body.rosterVersion, reason: body.reason });
    return mutationResponse(response, result);
  }
  if (request.method === "POST" && path === "/assignments/transfer") {
    const result = await runtime.transferResponder(await readJsonBody(request));
    return mutationResponse(response, result);
  }
  if (request.method === "POST" && path === "/compass/recommend") {
    const payload = await readJsonBody(request);
    return sendJson(response, 200, await runtime.recommendLive(payload.issueId));
  }
  if (request.method === "POST" && ["/assignments/confirm", "/assignments/override"].includes(path)) {
    const payload = await readJsonBody(request);
    return sendJson(response, 200, await runtime.decideLive({
      recommendationId: payload.recommendationId,
      responderId: payload.responderId,
      decision: path.endsWith("/confirm") ? "CONFIRMED" : "OVERRIDDEN",
    }));
  }
  const raiseMatch = path.match(/^\/issues\/([^/]+)\/raise$/);
  if (request.method === "POST" && raiseMatch) {
    try {
      return sendJson(response, 200, await runtime.raiseIssue(decodeURIComponent(raiseMatch[1])));
    } catch (error) {
      return sendJson(response, requestErrorStatus(error, 404), { error: error.message });
    }
  }
  const recommendMatch = path.match(/^\/issues\/([^/]+)\/recommend$/);
  if (request.method === "POST" && recommendMatch) {
    try {
      return sendJson(response, 200, await runtime.requestRecommendation(decodeURIComponent(recommendMatch[1])));
    } catch (error) {
      return sendJson(response, requestErrorStatus(error, 409), { error: error.message });
    }
  }
  const confirmMatch = path.match(/^\/issues\/([^/]+)\/confirm$/);
  if (request.method === "POST" && confirmMatch) {
    try {
      const state = await runtime.snapshot();
      const issueId = decodeURIComponent(confirmMatch[1]);
      const responderId = state.workflow?.agentOutcome?.result?.topRecommendation?.responderId;
      return sendJson(response, 200, await runtime.decideAssignment(issueId, responderId, "CONFIRMED"));
    } catch (error) {
      return sendJson(response, requestErrorStatus(error, 409), { error: error.message });
    }
  }
  const overrideMatch = path.match(/^\/issues\/([^/]+)\/override\/([^/]+)$/);
  if (request.method === "POST" && overrideMatch) {
    try {
      return sendJson(response, 200, await runtime.decideAssignment(
        decodeURIComponent(overrideMatch[1]),
        decodeURIComponent(overrideMatch[2]),
        "OVERRIDDEN",
      ));
    } catch (error) {
      return sendJson(response, requestErrorStatus(error, 409), { error: error.message });
    }
  }
  const auditMatch = path.match(/^\/audit\/([^/]+)$/);
  if (request.method === "GET" && auditMatch) {
    const event = await runtime.getAuditEvent(decodeURIComponent(auditMatch[1]));
    return event
      ? sendJson(response, 200, event)
      : sendJson(response, 404, { error: "Audit event was not found" });
  }
  return null; // no room-scoped route matched
}

/**
 * `manager` resolves a room id to a runtime — see control-room-manager.mjs.
 * Settings and logs are deployment-global and stay unscoped (§4.2/§4.5 of
 * Control_Rooms_SOW_v1_DRAFT.md); everything else moves under
 * /api/control-rooms/:id/. No route reaches a room's runtime except through
 * `manager.getRoom(id)` — see §4.1, "the manager is the sole boundary".
 */
export function createRequestHandler(manager, logger = null, settingsService = null, { publicSettingsEditable = false } = {}) {
  return async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    const startedAt = performance.now();
    // Request lifecycle entries belong to the room when the URL resolves to
    // one; global endpoints intentionally retain no controlRoomId.
    const lifecycleRoomMatch = url.pathname.match(/^\/api\/control-rooms\/([^/]+)(?:\/.*)?$/);
    const lifecycleRoom = lifecycleRoomMatch ? manager?.getRoom(decodeURIComponent(lifecycleRoomMatch[1])) : null;
    const requestLogger = lifecycleRoom ? createControlRoomLogger(logger, lifecycleRoom.id) : logger;
    logEvent(requestLogger, "request_started", { method: request.method, path: url.pathname });
    try {
      if (/^\/api\/control-rooms\/[^/]+(?:\/|$)/.test(url.pathname) && !['GET','HEAD','OPTIONS'].includes(request.method)) assertRoomMutationRequest(request);
      if (request.method === "GET" && url.pathname === "/api/control-rooms") {
        return sendJson(response, 200, { rooms: await manager.listRoomsWithStatus() });
      }
      const renameRoomMatch = url.pathname.match(/^\/api\/control-rooms\/([^/]+)\/display-name$/);
      if (request.method === "PATCH" && renameRoomMatch) {
        const roomId = decodeURIComponent(renameRoomMatch[1]);
        try {
          const result = await manager.renameRoomDisplayName(roomId, await readJsonBody(request));
          if (result.status === "CONFLICT") return sendJson(response, 409, { error: "Control room metadata changed", code: "ROOM_METADATA_CONFLICT", current: { displayName: result.displayName, revision: result.revision } });
          return sendJson(response, 200, result);
        } catch (error) {
          return sendJson(response, requestErrorStatus(error, 503), { error: error.message });
        }
      }
      const editable = settingsEditable(request, publicSettingsEditable);
      if (request.method === "GET" && url.pathname === "/api/settings") {
        if (!settingsService) return sendJson(response, 503, { error: "Provider settings are unavailable" });
        return sendJson(response, 200, { ...await settingsService.snapshot(), editable });
      }
      // Model discovery calls the provider, so it is an operator action like a save.
      if (url.pathname.startsWith("/api/settings") && !editable) return sendJson(response, 403, SETTINGS_READ_ONLY);
      if (request.method === "GET" && url.pathname === "/api/settings/models") {
        if (!settingsService) return sendJson(response, 503, { error: "Provider settings are unavailable" });
        // No per-room Offline gate here (an earlier single-instance design had
        // one): settings/model discovery is deployment-global and independent
        // of any one room's mode, so no single room's mode is authoritative.
        return sendJson(response, 200, await settingsService.refreshModels(url.searchParams.get("provider") ?? undefined));
      }
      if (request.method === "POST" && url.pathname === "/api/settings/credentials") {
        if (!settingsService) return sendJson(response, 503, { error: "Provider settings are unavailable" });
        try {
          const input = await readJsonBody(request);
          const saved = await settingsService.updateCredential(input);
          logEvent(logger, "provider_credential_updated", { provider: input.provider });
          return sendJson(response, 200, saved);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }
      if (request.method === "DELETE" && url.pathname === "/api/settings/credentials") {
        if (!settingsService) return sendJson(response, 503, { error: "Provider settings are unavailable" });
        try {
          const provider = url.searchParams.get("provider");
          const saved = await settingsService.removeCredential(provider);
          logEvent(logger, "provider_credential_removed", { provider });
          return sendJson(response, 200, saved);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }
      if (request.method === "POST" && url.pathname === "/api/settings") {
        if (!settingsService) return sendJson(response, 503, { error: "Provider settings are unavailable" });
        try {
          const input = await readJsonBody(request);
          const saved = await settingsService.update(input);
          const role = input.role ?? "compass";
          logEvent(logger, "provider_settings_updated", { provider: saved.provider, role, modelId: saved.roles[role].modelId, reasoningEffort: saved.roles[role].reasoningEffort });
          return sendJson(response, 200, saved);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }
      if (request.method === "GET" && url.pathname === "/api/logs") {
        if (typeof logger?.recent !== "function") return sendJson(response, 503, { error: "Application log store is unavailable" });
        const limit = Number(url.searchParams.get("limit") ?? 100);
        return sendJson(response, 200, { events: await logger.recent(limit) });
      }
      if (request.method === "POST" && url.pathname === "/api/logs/client") {
        const payload = await readJsonBody(request);
        logEvent(logger, "client_error", {
          action: typeof payload.action === "string" ? payload.action.slice(0, 80) : "unknown",
          message: typeof payload.message === "string" ? payload.message.slice(0, 500) : "Unknown browser error",
        });
        return sendJson(response, 202, { accepted: true });
      }

      const roomMatch = url.pathname.match(/^\/api\/control-rooms\/([^/]+)(\/.*)?$/);
      if (roomMatch) {
        const roomId = decodeURIComponent(roomMatch[1]);
        const room = manager.getRoom(roomId);
        if (!room) return sendJson(response, 404, { error: `Unknown control room: ${roomId}` });
        if (room.health !== "READY") {
          return sendJson(response, 503, { error: `Control room "${roomId}" is unavailable`, code: "ROOM_UNAVAILABLE", reason: room.reason ?? null });
        }
        // Any room mutation is operator activity; GET polling is not (see
        // recordActivity in control-room-manager.mjs).
        if (request.method !== "GET") manager.recordActivity?.(room.id);
        if (request.method === "POST" && roomMatch[2] === "/activity") return sendJson(response, 202, { accepted: true });
        const handled = await handleRoomScopedRoute({ request, response, path: roomMatch[2] || "", runtime: room.applicationRuntime, logger, url, roomId: room.id ?? roomId });
        if (handled) return handled;
        // A known route prefix with no matching room-scoped branch: fall
        // through to the same 405/serveStatic handling as an unknown path,
        // rather than a distinct behavior a client would have to special-case.
      }

      if (request.method === "GET") return serveStatic(url.pathname, response);
      return sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      logEvent(requestLogger, "request_error", { method: request.method, path: url.pathname, error: error.message });
      const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      return sendJson(response, status, { error: status < 500 ? error.message : "Internal server error", ...(status < 500 && error.code ? { code: error.code } : {}) });
    } finally {
      logEvent(requestLogger, "request_completed", {
        method: request.method,
        path: url.pathname,
        status: response.statusCode ?? "unknown",
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
  };
}

export function createCompassServer(manager, logger = console, settingsService = null, options = {}) {
  const server = createServer(createRequestHandler(manager, logger, settingsService, options));
  server.on("error", (error) => logEvent(logger, "server_error", { error: error.message }));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.COMPASS_CONTROL_ROOMS_DATA_ROOT && process.env.NODE_ENV !== "test") {
    throw new Error("COMPASS_CONTROL_ROOMS_DATA_ROOT is test-only and requires NODE_ENV=test");
  }
  // Everything that survives a process restart resolves through this one
  // root.  Docker mounts it at /app/data; local installs retain backend/data.
  const dataRoot = resolveCompassDataRoot();
  const logger = createApplicationLogger(createApplicationLogStore(compassDataPath("application-events.json")), console);
  const settingsService = createProviderSettingsService({ filePath: compassDataPath("provider-settings.json"), logger, checkModelsOnBoot: process.env.NODE_ENV !== "test" });
  await settingsService.initialize();
  const manager = await createControlRoomManager({
    // This is deliberately narrower than COMPASS_DATA_DIR: it is a test-only
    // isolation seam retained for the hermetic browser suite.
    dataRoot: process.env.COMPASS_CONTROL_ROOMS_DATA_ROOT ?? dataRoot,
    logger,
    plannerOptions: () => settingsService.requestOptions("event-planner"),
    agentOptions: () => settingsService.requestOptions("compass"),
    investigatorOptions: () => settingsService.requestOptions("investigator"),
    narratorOptions: () => settingsService.requestOptions("narrator"),
    assistantOptions: () => settingsService.requestOptions("assistant"),
  });
  // createControlRoomManager already reconciled each READY room once during
  // construction; this is the same reconcile-before-serve discipline the
  // single-instance boot sequence used, extended per room.
  const server = createCompassServer(manager, logger, settingsService, { publicSettingsEditable: publicSettingsEditableFromEnv() });
  // Only the process that owns the port may drive the simulation. Starting the
  // scheduler before binding left every failed start (EADDRINUSE) alive as a
  // headless writer competing for the same state files.
  server.on("error", (error) => {
    // Only a failure to take the port is fatal. A later socket error must not
    // tear down a server that is serving.
    if (server.listening) return;
    logEvent(logger, "server_start_failed", { host, port, error: error.message });
    manager.stopProcessScheduler();
    process.exitCode = 1;
    server.close();
  });
  server.listen(port, host, () => {
    logEvent(logger, "server_started", { host, port });
    manager.startProcessScheduler();
  });
}
