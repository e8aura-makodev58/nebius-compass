import { initWorkspaceNav } from "./workspace-nav.js";
import { renderStaffing } from './staffing-view.js';
import { renderInvestigations, investigationPolicyMarkup, bindInvestigationPolicy, investigationAnalyticsMarkup, selectInvestigation } from './investigation-view.js';
import { initStationKpis } from './station-kpis-view.js';
import { initLoadboards } from './loadboards-view.js';
import { initObligations } from './obligations-view.js';
import { initHandlerEpisodes } from './handler-episodes-view.js';
import { initCalibrations } from './calibrations-view.js';
import { initChangeoverReadiness } from './changeover-readiness-view.js';
import { initAsk } from './ask-view.js';
import { initTiling, TILE_SCREENS } from "./tiling.js";
import { announcePanelWindow, createPanelWindows } from "./window-panels.js";
import { initParetoPanel } from "./pareto.js";
import { setHtml } from "./render-lifecycle.js";
import { layoutProjectedLabels } from "./map-label-layout.js";
import { trapFocus } from "./focus-trap.js";

const elements = Object.fromEntries([
  "floor", "issue-summary", "issue-list", "event-feed", "responder-list", "station-list", "personnel-tab", "stations-tab", "baseline-panel", "recommendation-panel", "simulation-controls",
  "simulation-time", "simulation-status", "speed-select", "pause-resume-button", "force-event-button", "force-resolve-button", "reset-button", "live-mode-button",
  "offline-mode-button", "offline-reset-button", "control-room-tab", "rooms-tab", "analytics-tab", "control-room-view", "rooms-view", "rooms-content", "analytics-view", "analytics-content",
  "settings-tab", "settings-view", "settings-content", "settings-api-panel", "settings-demo-panel", "settings-api-tab", "settings-demo-tab", "agent-activity-indicator", "agent-activity-label", "demo-primary-activity", "demo-activity-title", "demo-activity-detail",
  "event-planner-dot", "event-planner-status", "compass-dot", "compass-status", "demo-selected-issue", "issue-heading", "context-eyebrow",
  "control-room-search", "open-control-search", "control-search-palette", "close-control-search", "control-search-input", "control-search-filters", "control-search-results",
  "room-picker-view", "room-picker-list",
].map((id) => [id, document.querySelector(`#${id}`)]));

/**
 * Which Control Room this browser tab is viewing, read once at boot from the
 * URL — see Control_Rooms_SOW_v1_DRAFT.md §4.5. `null` on the bare `/` picker
 * route. Room selection is per-browser and never changes without a full page
 * navigation (§4.6): there is deliberately no code path that reassigns this.
 */
const currentControlRoomId = (() => {
  const match = window.location.pathname.match(/^\/rooms\/([^/]+)(?:\/display\/[A-Za-z]+)?\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
})();
/**
 * Wall-display screens: `/rooms/:id/display/:screen` shows one panel full screen, so a
 * control room can put each panel on its own monitor. Read once at boot like the room;
 * `null` is the operator console. An unknown screen name falls back to the console.
 */
const DISPLAY_SCREENS = { map: "Floor map", issues: "Issues", events: "Event feed", dispatch: "Dispatch / context", analytics: "Analytics", pareto: "Issue Pareto", staffing: "Staffing", investigation: "Field reports", stationKpis: "Station KPIs", loadboards: "Loadboards", obligations: "Obligations", handlerEpisodes: "Handler episodes", calibrations: "Calibrations", changeoverReadiness: "Changeover readiness" };
const displayScreen = (() => {
  const match = window.location.pathname.match(/^\/rooms\/[^/]+\/display\/([A-Za-z]+)\/?$/);
  return match && Object.hasOwn(DISPLAY_SCREENS, match[1]) ? match[1] : null;
})();
const FLOOR_WIDTH = 150;
const FLOOR_HEIGHT = 100;
const BUILDING_FLOORS = [1, 2, 3];
const BUILDING_PITCH = 58;
const DEFAULT_YAW = -35;
const VIEW_MODE_KEY = "compass.map.view";
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 3;
const ZOOM_STEP = 1.2;
/** Longest camera transition (`.building`, .55s) plus a frame of slack. */
const CAMERA_SETTLE_MS = 600;
let currentState = null;
let selectedIssueId = null;
let selectedStationId = null;
let selectedResponderId = null;
let sidebarTab = "personnel";
const paretoRoot = document.querySelector("#pareto-panel");
let paretoPanel = null;
let panelWindows = null;
let tiling = null;
let workspaceNav = null;
let askView = { render() {} };
let stationKpisView = null;
let loadboardsView = null;
let obligationsView = null;
let handlerEpisodesView = null;
let calibrationsView = null;
let changeoverReadinessView = null;
let currentView = "control";
let currentSettingsTab = "api";
let actionInFlight = false;
let localAgentActivity = null;
let showingAuditTrail = false;
let selectedEventId = null;
let selectedEventSnapshot = null;
let auditRecord = null;
let auditError = null;
let auditLoading = false;
let auditRequestedSignature = null;
let auditRequestSequence = 0;
// Station history is deliberately separate from the event-feed audit state.
// Selecting an older station record must not change, or be overwritten by,
// the operator's selected event-feed chronology.
let selectedStationHistoryIssueId = null;
let stationHistoryAuditRecord = null;
let stationHistoryAuditError = null;
let stationHistoryAuditLoading = false;
let stationHistoryAuditSignature = null;
let stationHistoryAuditRequestSequence = 0;
let buildingYaw = DEFAULT_YAW;
let focusedNodeId = null;
let pinnedFloor = null;
let mapZoom = 1;
let mapPanX = 0;
let mapPanY = 0;
let mapDrag = null;
let mapSpacePressed = false;
let labelLayoutFrame = null;
let labelFollowUntil = 0;
let viewMode = "2d";
let searchOpen = false;
let searchFilter = "ALL";
let searchQuery = "";
let searchActiveIndex = 0;
let searchReturnFocus = null;
let analyticsDrilldown = null;
let analyticsEquipmentFilter = "ATTENTION";
let analyticsEquipmentQuery = "";
let analyticsEquipmentPage = 0;
let analyticsReturnFocus = null;
let analyticsPeriodLevel = "DAY";
let analyticsPeriodDetail = null;
try { viewMode = localStorage.getItem(VIEW_MODE_KEY) === "iso" ? "iso" : "2d"; } catch {}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const statusLabel = (status) => String(status ?? "unknown").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const positionStyle = (entity, offset = {}) => `left:${((entity.x + (offset.x ?? 0)) / FLOOR_WIDTH) * 100}%;top:${((entity.y + (offset.y ?? 0)) / FLOOR_HEIGHT) * 100}%;`;
const responderDisplayOffsets = { "R-TECH073": { x: -8, y: -14 }, "R-OPER142": { x: 0, y: 14 }, "R-ENGR104": { x: 8, y: -14 }, "R-OPER088": { x: -3, y: 14 }, "R-TECH216": { x: 3, y: -14 }, "R-ENGR028": { y: 14 } };
const formatMinutes = (value) => value === null || value === undefined ? "No prior history" : `${Number(value).toFixed(Number.isInteger(value) ? 0 : 1)} min`;
// Evidence counts can be confidence weights (fractional); show them to one decimal.
const formatCount = (count) => typeof count !== "number" || Number.isInteger(count) ? String(count) : count.toFixed(1);
const formatPercent = (value, count = 3) => value === null || value === undefined ? "—" : count < 3 ? `Insufficient data (n=${formatCount(count)})` : `${Math.round(value * 100)}% (n=${formatCount(count)})`;
const responderName = (state, id) => state.responders.find((responder) => responder.id === id)?.name ?? id ?? "—";
const activeIssues = (state) => state.issues.filter((issue) => issue.status !== "RESOLVED");
const latestRecommendation = (state, issueId) => [...(state.recommendations ?? [])].reverse().find((entry) => entry.issueId === issueId);
const issueRoster = (state, issueId) => (state.assignments ?? []).filter((row) => row.issueId === issueId && row.status === "ACTIVE").sort((a, b) => a.role === "PRIMARY" ? -1 : b.role === "PRIMARY" ? 1 : 0);
const activeAttempt = (state, issueId) => (state.resolutionAttempts ?? []).find((row) => row.issueId === issueId && row.status === "ACTIVE");

function staffingControls(state, issue) {
  const roster = issueRoster(state, issue.id);
  const attempt = activeAttempt(state, issue.id);
  const pendingOffer = (state.dispatchOffers ?? []).find((offer) => offer.issueId === issue.id && offer.status === "PENDING");
  const rosterRows = roster.length ? roster.map((row) => `<li><strong>${escapeHtml(responderName(state, row.responderId))}</strong><span>${statusLabel(row.role)} · joined ${escapeHtml(new Date(row.joinedAt).toISOString().slice(11, 16))}</span>${roster.length === 2 ? `<button type="button" class="secondary-button roster-release" data-release-responder="${escapeHtml(row.responderId)}">Release</button>` : ""}</li>`).join("") : `<li><span>No responder currently staffed.</span></li>`;
  const transferable = (state.assignments ?? []).filter((row) => row.status === "ACTIVE" && row.issueId !== issue.id && issueRoster(state, row.issueId).length === 2).map((row) => {
    const sourceAttempt = activeAttempt(state, row.issueId);
    return { row, sourceAttempt };
  });
  const transferOptions = transferable.map(({ row, sourceAttempt }) => `<option value="${escapeHtml(`${row.responderId}|${row.issueId}|${sourceAttempt.rosterVersion}`)}">${escapeHtml(responderName(state, row.responderId))} from ${escapeHtml(row.issueId)} (${statusLabel(row.role)}; source returns to 1 of 2)</option>`).join("");
  const canRequest = roster.length === 1 && !pendingOffer && attempt?.assistance?.status !== "REQUESTED";
  const requestLabel = pendingOffer?.purpose === "ASSISTANCE" ? `Support offer pending with ${responderName(state, pendingOffer.responderId)}` : attempt?.assistance?.status === "REQUESTED" ? "Compass is matching support" : "Request second responder";
  return `<section class="staffing-panel"><div class="staffing-heading"><div><p class="eyebrow">Issue staffing</p><h4>${roster.length} of 2 responders</h4></div>${roster.length === 1 ? `<button id="request-support-button" type="button" class="secondary-button" ${canRequest ? "" : "disabled"}>${escapeHtml(requestLabel)}</button>` : ""}</div><ol class="roster-list">${rosterRows}</ol>${roster.length < 2 && transferOptions ? `<div class="transfer-control"><label>Central transfer from a two-person issue<select id="transfer-responder-select"><option value="">Choose responder to transfer</option>${transferOptions}</select></label><p>The source issue will continue with one responder; primary promotion is automatic when required.</p><button id="transfer-responder-button" type="button" class="secondary-button" disabled>Transfer responder</button></div>` : ""}</section>`;
}

function bindStaffingControls(state, issue) {
  const attempt = activeAttempt(state, issue.id);
  const request = document.querySelector("#request-support-button");
  if (request) request.onclick = () => perform(`/issues/${encodeURIComponent(issue.id)}/assistance`);
  document.querySelectorAll("[data-release-responder]").forEach((button) => { button.onclick = () => perform(`/issues/${encodeURIComponent(issue.id)}/responders/${encodeURIComponent(button.dataset.releaseResponder)}/release`, { rosterVersion: attempt.rosterVersion, reason: "CENTRAL_RELEASE" }); });
  const select = document.querySelector("#transfer-responder-select");
  const transfer = document.querySelector("#transfer-responder-button");
  if (select && transfer) {
    select.onchange = () => { transfer.disabled = !select.value; };
    transfer.onclick = () => {
      const [responderId, sourceIssueId, sourceRosterVersion] = select.value.split("|");
      perform("/assignments/transfer", { responderId, sourceIssueId, targetIssueId: issue.id, sourceRosterVersion: Number(sourceRosterVersion), targetRosterVersion: attempt?.rosterVersion ?? null });
    };
    transfer.disabled = !select.value;
  }
}

function activityForUrl(path) {
  if (path === "/simulation/force-event") return { title: "Event workflow running", detail: "The event planner is generating and validating the next event. Compass may then prepare its recommendation." };
  if (path === "/compass/recommend") return { title: "Compass is running", detail: "Compass is weighing the eligible responder evidence and generating a recommendation." };
  return null;
}

function setActivityDot(element, status) {
  element.className = `activity-dot ${String(status ?? "IDLE").toLowerCase()}`;
}

function renderAgentActivity(state) {
  if (!state) return;
  const live = state.mode === "LIVE";
  const planner = state.agentActivity?.eventPlanner ?? { status: "IDLE", detail: "Waiting for the next event opportunity." };
  const compass = state.agentActivity?.compass ?? { status: "IDLE", detail: live ? "Waiting for a recommendation request." : "Offline Demo uses a stored fixture and makes no model call." };
  const running = localAgentActivity ?? [planner, compass].find((entry) => entry.status === "RUNNING");
  const plannerDisplay = localAgentActivity?.title === "Event workflow running"
    ? { status: "RUNNING", detail: "Generating and validating the next operational event." }
    : planner;
  const compassDisplay = localAgentActivity?.title === "Compass is running"
    ? { status: "RUNNING", detail: localAgentActivity.detail }
    : localAgentActivity?.title === "Event workflow running"
      ? { status: "IDLE", detail: "Waiting for event validation before recommendation work begins." }
      : compass;
  const completed = [planner, compass].filter((entry) => entry.completedAtRealTime).sort((left, right) => right.completedAtRealTime.localeCompare(left.completedAtRealTime))[0];
  const title = running?.title ?? (running?.agent === "EVENT_PLANNER" ? "Event planner is running" : running?.agent === "COMPASS" ? "Compass is running" : live ? "Agents idle" : "Offline fixture mode");
  const detail = running?.detail ?? completed?.detail ?? (live ? "Waiting for the next agent task." : "Offline Demo is API-free; recommendations come from the validated fixture.");
  const working = Boolean(running);

  elements["agent-activity-label"].textContent = title;
  elements["agent-activity-indicator"].classList.toggle("working", working);
  elements["demo-primary-activity"].classList.toggle("working", working);
  elements["demo-activity-title"].textContent = title;
  elements["demo-activity-detail"].textContent = detail;
  elements["event-planner-status"].textContent = plannerDisplay.detail;
  elements["compass-status"].textContent = compassDisplay.detail;
  setActivityDot(elements["event-planner-dot"], plannerDisplay.status);
  setActivityDot(elements["compass-dot"], compassDisplay.status);

  const selected = live ? activeIssues(state).find((issue) => issue.id === selectedIssueId) : null;
  elements["force-event-button"].disabled = !live || actionInFlight;
  elements["force-resolve-button"].disabled = !live || actionInFlight || selected?.status !== "ASSIGNED";
  elements["demo-selected-issue"].textContent = !live
    ? "Simulation overrides are available in Live Simulation only."
    : selected?.status === "ASSIGNED"
      ? `${selected.id} is assigned and can be resolved immediately.`
      : "Select an assigned issue in the Control Room to enable Force Resolve.";
}

const scenarioLabel = (value) => ({ NORMAL: "Normal operations", ELEVATED_DEMAND: "Elevated demand", PERSONNEL_SHORTAGE: "Personnel shortage", RECURRING_TEMPORARY_REPAIRS: "Recurring temporary repairs", AUTO: "Auto" }[value] ?? statusLabel(value));

function formatDemoTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : date.toISOString().replace("T", " ").slice(0, 16);
}

function renderDemoContinuity(state) {
  const continuity = state?.workforceContinuity;
  const target = document.querySelector("#demo-continuity");
  if (!target) return;
  if (!continuity) { setHtml(target, ""); return; }
  const scenario = continuity.scenario ?? {};
  const deferred = continuity.deferredDemand ?? [];
  const staffing = continuity.staffingAudit ?? [];
  const handovers = continuity.handovers ?? [];
  const scenarioOptions = ["NORMAL", "ELEVATED_DEMAND", "PERSONNEL_SHORTAGE", "RECURRING_TEMPORARY_REPAIRS", "AUTO"].map((value) => `<option value="${value}" ${scenario.selected === value ? "selected" : ""}>${escapeHtml(scenarioLabel(value))}</option>`).join("");
  const deferredRows = deferred.length ? `<ol class="demo-record-list">${deferred.slice(-8).reverse().map((row) => `<li><strong>${escapeHtml(row.reason ?? "Demand deferred")}</strong><span>${escapeHtml(formatDemoTimestamp(row.recordedAt ?? row.simulationTimestamp ?? row.simulationTime ?? row.createdAt))}</span></li>`).join("")}</ol>` : `<p class="workflow-prompt">No demand has been deferred in this room.</p>`;
  const staffingRows = staffing.length ? `<ol class="demo-record-list">${staffing.slice(-5).reverse().map((row) => `<li><strong>${escapeHtml(row.outcome === "AUTO_APPROVED" ? "Auto-approved by policy" : statusLabel(row.outcome ?? row.decision ?? row.action ?? row.type ?? "review"))}</strong><span>${escapeHtml([formatDemoTimestamp(row.simulationTimestamp ?? row.simulationTime ?? row.createdAt), Number.isFinite(row.actionableIssues) && Number.isFinite(row.activeStaff) ? `${row.actionableIssues} actionable issues · ${row.activeStaff} active staff` : null].filter(Boolean).join(" · "))}</span></li>`).join("")}</ol>` : `<p class="workflow-prompt">No staffing review has been recorded yet.</p>`;
  const handoverRows = handovers.length ? `<ol class="demo-record-list">${handovers.slice(-3).reverse().map((row) => `<li><strong>${escapeHtml(row.outgoingCrew && row.incomingCrew ? `Crew ${row.outgoingCrew} → Crew ${row.incomingCrew}` : "Shift handover")}</strong><span>${escapeHtml([formatDemoTimestamp(row.simulationTimestamp ?? row.simulationTime ?? row.createdAt ?? row.handoverAt), Array.isArray(row.unresolvedIssueIds) ? `${row.unresolvedIssueIds.length} unresolved issues carried forward` : null].filter(Boolean).join(" · "))}</span></li>`).join("")}</ol>` : `<p class="workflow-prompt">No shift handover has been recorded yet.</p>`;
  setHtml(target, `<section class="demo-panel demo-continuity"><p class="eyebrow">Operating scenario</p><h3>Workforce continuity</h3><p class="workflow-prompt">This room’s scenario controls synthetic demand only. It does not expose generator seeds or employee simulation truth.</p><label class="settings-field">Scenario preset<select id="demo-scenario-select">${scenarioOptions}</select></label><button id="demo-scenario-save" type="button" class="secondary-button" ${state.mode !== "LIVE" ? "disabled" : ""}>Apply scenario</button><p id="demo-scenario-feedback" class="workflow-prompt" aria-live="polite"></p><div class="demo-fact-grid"><div><span>Normal shift</span><strong>${escapeHtml(continuity.normalShiftHours ?? "—")} hours</strong></div><div><span>Maximum duty</span><strong>${escapeHtml(continuity.maximumDutyHours ?? "—")} hours</strong></div><div><span>Minimum rest</span><strong>${escapeHtml(continuity.minimumRestHours ?? "—")} hours</strong></div><div><span>Active staffing cap</span><strong>${escapeHtml(continuity.maximumActiveStaff ?? "—")}</strong></div></div></section><section class="demo-panel demo-continuity"><p class="eyebrow">Demo safety limit</p><h3>Deferred demand</h3><p class="workflow-prompt">Compass caps actionable issues at ${escapeHtml(continuity.maxActionableIssues ?? 10)} for this demonstration. Additional simulated demand is recorded here and is not shown as an actionable Control Room issue.</p>${deferredRows}</section><section class="demo-panel demo-continuity"><p class="eyebrow">Shift coverage</p><h3>Staffing outlook</h3>${staffingRows}<div id="demo-staffing-outlook"></div><label>Staffing approval policy<select id="staffing-policy"><option value="OPERATOR" ${continuity.staffingApproval!=="AUTO_APPROVE_TOP"?"selected":""}>Central command approval</option><option value="AUTO_APPROVE_TOP" ${continuity.staffingApproval==="AUTO_APPROVE_TOP"?"selected":""}>Auto-approve top after deadline (audited)</option></select></label><button id="staffing-policy-save" type="button">Save staffing policy</button></section><section class="demo-panel demo-continuity"><p class="eyebrow">Continuity record</p><h3>Recent handovers</h3>${handoverRows}</section>${investigationPolicyMarkup(state, escapeHtml)}`);
  bindInvestigationPolicy(state, { request: roomApi, onState: render });
  document.querySelector("#demo-scenario-save")?.addEventListener("click", saveDemoScenario);
  const policyButton = document.querySelector('#staffing-policy-save');
  if (policyButton) policyButton.onclick = async () => {
    try { render(await roomApi('/demo/staffing-policy', {method:'PATCH',body:JSON.stringify({staffingApproval:document.querySelector('#staffing-policy').value,expectedRevision:continuity.staffingPolicyRevision ?? 0})})); }
    catch (error) { document.querySelector('#demo-scenario-feedback').textContent=error.message; }
  };
  renderStaffing(state, {escape:escapeHtml, request:roomApi, onState:render});

}

async function saveDemoScenario() {
  const button = document.querySelector("#demo-scenario-save");
  const feedback = document.querySelector("#demo-scenario-feedback");
  const selected = document.querySelector("#demo-scenario-select")?.value;
  const continuity = currentState?.workforceContinuity;
  if (!selected || !continuity?.scenario) return;
  button.disabled = true;
  feedback.textContent = "";
  try {
    const nextState = await roomApi("/demo/scenario", { method: "PATCH", body: JSON.stringify({ scenario: selected, expectedRevision: continuity.scenario.revision }) });
    render(nextState);
    const nextFeedback = document.querySelector("#demo-scenario-feedback");
    if (nextFeedback) nextFeedback.textContent = `${scenarioLabel(selected)} is now active for this shared Control Room.`;
  } catch (error) {
    const current = error.payload?.conflict?.current;
    feedback.textContent = current ? `Another operator changed the scenario to ${scenarioLabel(current.selected)}. Review the current setting and try again.` : error.message;
  } finally { if (button?.isConnected) button.disabled = false; }
}

/**
 * Build one shared 2D/2.5D manufacturing-floor scene. Camera state is applied
 * after setHtml so a poll never destroys an in-progress pan or zoom gesture.
 */
function nodeMarkup(kind, item, classes, label, status, offset) {
  return `<button type="button" class="map-node ${kind} ${classes}" data-focus-id="${escapeHtml(item.id)}" data-focus-kind="${kind}" data-overlay-label="${escapeHtml(label)}" data-overlay-status="${escapeHtml(status)}" style="${positionStyle(item, offset)}" aria-label="${escapeHtml(`${label}, ${status}, Floor ${item.floor ?? 1}`)}"><span class="node-shape" aria-hidden="true"></span><span class="node-copy"><span class="node-label">${escapeHtml(label)}</span><span class="node-status">${escapeHtml(status)}</span></span></button>`;
}

function renderFloor(state) {
  const planes = BUILDING_FLOORS.map((floor) => {
    const equipment = state.equipment.filter((item) => item.floor === floor).map((item) => nodeMarkup(
      "equipment",
      item,
      item.status === "ISSUE_ACTIVE" || item.status === "ATTENTION_REQUIRED" ? "active-equipment" : "",
      item.name,
      statusLabel(item.status),
    )).join("");
    const responders = state.responders.filter((item) => item.floor === floor && item.availability !== "UNAVAILABLE").map((item) => nodeMarkup(
      "responder",
      item,
      item.availability.toLowerCase(),
      item.name,
      statusLabel(item.availability),
      responderDisplayOffsets[item.id],
    )).join("");
    return `<div class="floor-plane" data-floor="${floor}" style="--level:${floor - 1};"><div class="floor-grid" aria-hidden="true"></div><span class="floor-tag">Floor ${floor}</span>${equipment}${responders}</div>`;
  }).join("");
  const floors = BUILDING_FLOORS.map((floor) => `<button type="button" class="floor-choice" data-select-floor="${floor}" aria-label="Show manufacturing floor ${floor}">F${floor}</button>`).join("");
  setHtml(elements.floor, `<div class="building-stage"><div class="building-viewport"><div class="building">${planes}</div></div></div><div class="map-label-layer" aria-hidden="true"></div><div class="building-controls" aria-label="Manufacturing floor map controls"><span class="control-group view-controls"><button type="button" id="view-2d" aria-label="Use 2D top view">2D</button><button type="button" id="view-iso" aria-label="Use 2.5D perspective view">2.5D</button></span><span class="control-group floor-controls" aria-label="Manufacturing floor selection">${floors}</span><span class="control-group camera-controls"><button type="button" id="zoom-out" aria-label="Zoom out">−</button><span id="zoom-level" class="building-hint">100%</span><button type="button" id="zoom-in" aria-label="Zoom in">+</button><button type="button" id="reset-map" aria-label="Reset map view">Reset</button><button type="button" id="rotate-left" aria-label="Rotate building left">⟲</button><button type="button" id="rotate-right" aria-label="Rotate building right">⟳</button></span></div><p class="map-help">Space + drag empty map to pan · Use + / − to zoom</p>`);
  document.querySelector("#view-2d").onclick = () => setViewMode("2d");
  document.querySelector("#view-iso").onclick = () => setViewMode("iso");
  document.querySelector("#rotate-left").onclick = () => { buildingYaw -= 45; applyCamera(); };
  document.querySelector("#rotate-right").onclick = () => { buildingYaw += 45; applyCamera(); };
  document.querySelector("#zoom-in").onclick = () => setMapZoom(mapZoom * ZOOM_STEP);
  document.querySelector("#zoom-out").onclick = () => setMapZoom(mapZoom / ZOOM_STEP);
  document.querySelector("#reset-map").onclick = resetMapView;
  document.querySelectorAll("[data-select-floor]").forEach((button) => { button.onclick = () => { pinnedFloor = Number(button.dataset.selectFloor); focusedNodeId = null; applyCamera(); }; });
  document.querySelectorAll("[data-focus-id]").forEach((node) => {
    node.onclick = () => focusBuildingOn(node.dataset.focusKind, node.dataset.focusId);
    node.onpointerenter = () => scheduleProjectedLabelLayout();
    node.onpointerleave = () => scheduleProjectedLabelLayout();
  });
  applyCamera();
}

/** The floor the view should emphasise: an explicit selection, else the active issue's. */
function focusedFloor(state) {
  const focused = focusedNodeId
    && (state.equipment.find((item) => item.id === focusedNodeId) ?? state.responders.find((item) => item.id === focusedNodeId));
  if (focused) return focused.floor ?? 1;
  if (pinnedFloor) return pinnedFloor;
  const issue = state.issues.find((entry) => entry.id === selectedIssueId) ?? activeIssues(state)[0];
  return state.equipment.find((item) => item.id === issue?.equipmentId)?.floor ?? 1;
}

function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }

/**
 * Labels are measured from the live projected geometry, so a single frame taken
 * while the camera is still gliding would leave every leader line pointing at
 * where its node used to be. Follow the move instead: keep re-measuring each
 * frame until the longest camera transition has had time to settle.
 */
function scheduleProjectedLabelLayout(followMs = 0) {
  if (followMs > 0) labelFollowUntil = Math.max(labelFollowUntil, performance.now() + followMs);
  if (labelLayoutFrame !== null) return;
  const step = () => {
    labelLayoutFrame = null;
    renderProjectedLabels();
    if (performance.now() < labelFollowUntil) labelLayoutFrame = requestAnimationFrame(step);
  };
  labelLayoutFrame = requestAnimationFrame(step);
}

/** The nodes that carry a label: active issue stations, plus whatever is hovered or selected. */
function labelledNodes() {
  return [...new Set([
    ...elements.floor.querySelectorAll(".floor-plane.active-floor .map-node.active-equipment"),
    ...elements.floor.querySelectorAll(".map-node.focused, .map-node:hover"),
  ])];
}

/**
 * Geometry remains in the CSS 3D scene. The browser projects each node, then
 * this overlay layer measures those anchors and lays readable text out in
 * screen space, clear of the floor and of neighbouring labels.
 *
 * Overlays are rebuilt only when the labelled set or its copy changes, so the
 * per-frame path during a camera move is measure-and-position, not re-create.
 */
function renderProjectedLabels() {
  const layer = elements.floor.querySelector(".map-label-layer");
  if (!layer) return;
  const nodes = viewMode === "iso" ? labelledNodes() : [];
  const signature = nodes.map((node) => `${node.dataset.focusId}\u0000${node.dataset.overlayLabel}\u0000${node.dataset.overlayStatus}`).join("\u0001");
  if (layer.dataset.labels !== signature) {
    layer.dataset.labels = signature;
    layer.replaceChildren(...nodes.map((node) => {
      const overlay = document.createElement("span");
      overlay.className = `map-overlay-label ${node.dataset.focusKind}`;
      const title = document.createElement("strong");
      title.textContent = node.dataset.overlayLabel;
      const status = document.createElement("span");
      status.textContent = node.dataset.overlayStatus;
      overlay.append(title, status);
      return overlay;
    }));
  }
  if (!nodes.length) return;

  const overlays = [...layer.children];
  const bounds = elements.floor.getBoundingClientRect();
  const candidates = nodes.map((node, index) => {
    const shape = node.querySelector(".node-shape").getBoundingClientRect();
    const labelBounds = overlays[index].getBoundingClientRect();
    return {
      id: node.dataset.focusId,
      element: overlays[index],
      anchorX: shape.left + shape.width / 2 - bounds.left,
      anchorY: shape.top + shape.height / 2 - bounds.top,
      width: labelBounds.width,
      height: labelBounds.height,
    };
  });

  const positions = layoutProjectedLabels(candidates, { width: bounds.width, height: bounds.height }, { clearance: 52, gap: 8, padding: 10 });
  positions.forEach((position) => {
    position.element.style.left = `${position.left}px`;
    position.element.style.top = `${position.top}px`;
    position.element.style.setProperty("--leader-x", `${position.leaderX}px`);
    position.element.style.setProperty("--leader-height", `${position.leaderHeight}px`);
    position.element.dataset.labelPlacement = position.placement;
  });
}

function applyCamera() {
  if (!currentState) return;
  const stage = elements.floor.querySelector(".building-stage");
  const building = elements.floor.querySelector(".building");
  if (!stage || !building) return;
  const floor = focusedFloor(currentState);
  stage.style.setProperty("--zoom", mapZoom);
  stage.style.setProperty("--pan-x", `${mapPanX}px`);
  stage.style.setProperty("--pan-y", `${mapPanY}px`);
  building.style.setProperty("--yaw-user", `${buildingYaw}deg`);
  building.style.setProperty("--pitch-user", `${BUILDING_PITCH}deg`);
  building.style.setProperty("--focus-level", floor - 1);
  elements.floor.classList.toggle("view-2d", viewMode === "2d");
  elements.floor.classList.toggle("is-panning", Boolean(mapDrag));
  elements.floor.classList.toggle("is-pan-armed", mapSpacePressed && !mapDrag);
  elements.floor.querySelectorAll(".floor-plane").forEach((plane) => plane.classList.toggle("active-floor", Number(plane.dataset.floor) === floor));
  elements.floor.querySelectorAll("[data-focus-id]").forEach((node) => node.classList.toggle("focused", node.dataset.focusId === focusedNodeId));
  elements.floor.querySelectorAll("[data-select-floor]").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.selectFloor) === floor)));
  const twoD = elements.floor.querySelector("#view-2d");
  const iso = elements.floor.querySelector("#view-iso");
  twoD?.setAttribute("aria-pressed", String(viewMode === "2d"));
  iso?.setAttribute("aria-pressed", String(viewMode === "iso"));
  for (const id of ["#rotate-left", "#rotate-right"]) if (elements.floor.querySelector(id)) elements.floor.querySelector(id).disabled = viewMode === "2d";
  const zoomLabel = elements.floor.querySelector("#zoom-level");
  if (zoomLabel) zoomLabel.textContent = `${Math.round(mapZoom * 100)}%`;
  scheduleProjectedLabelLayout(CAMERA_SETTLE_MS);
}

function setViewMode(mode) {
  viewMode = mode;
  try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch {}
  applyCamera();
}

function setMapZoom(value, anchor = null) {
  const next = clamp(value, ZOOM_MIN, ZOOM_MAX);
  if (anchor && next !== mapZoom) {
    const ratio = next / mapZoom;
    mapPanX = anchor.x - (anchor.x - mapPanX) * ratio;
    mapPanY = anchor.y - (anchor.y - mapPanY) * ratio;
  }
  mapZoom = next;
  applyCamera();
}

function resetMapView() {
  mapZoom = 1;
  mapPanX = 0;
  mapPanY = 0;
  focusedNodeId = null;
  applyCamera();
}

/**
 * Turn the building so the chosen machine or responder faces the viewer.
 *
 * The scene is rotated about its centre, so a node's yaw offset is the angle
 * from the floor centre to that node. Negating it brings the node to the front.
 */
function focusBuildingOn(kind, id) {
  const source = kind === "equipment" ? currentState?.equipment : currentState?.responders;
  const item = source?.find((entry) => entry.id === id);
  if (!item) return;
  focusedNodeId = focusedNodeId === id ? null : id;
  if (focusedNodeId) {
    pinnedFloor = null;
    if (viewMode === "iso" && Math.hypot(item.x - FLOOR_WIDTH / 2, item.y - FLOOR_HEIGHT / 2) > 3) {
      const angle = Math.atan2(item.y - FLOOR_HEIGHT / 2, item.x - FLOOR_WIDTH / 2) * (180 / Math.PI);
      const target = -angle - 90;
      buildingYaw += ((target - buildingYaw) % 360 + 540) % 360 - 180;
    }
  }
  applyCamera();
  if (focusedNodeId) {
    if (kind === "equipment") { selectedStationId = id; selectedResponderId = null; clearStationHistorySelection(); const issue = stationIssues(currentState, id)[0]; if (issue) selectedIssueId = issue.id; clearEventSelection(); }
    else selectedResponderId = id;
    render(currentState);
  }
}

/** Focus a known public entity without changing the selected issue or audit view. */
function focusEntity(kind, id) {
  const source = kind === "equipment" ? currentState?.equipment : currentState?.responders;
  const item = source?.find((entry) => entry.id === id);
  if (!item) return;
  focusedNodeId = id;
  pinnedFloor = null;
  if (viewMode === "iso" && Math.hypot(item.x - FLOOR_WIDTH / 2, item.y - FLOOR_HEIGHT / 2) > 3) {
    const angle = Math.atan2(item.y - FLOOR_HEIGHT / 2, item.x - FLOOR_WIDTH / 2) * (180 / Math.PI);
    const target = -angle - 90;
    buildingYaw += ((target - buildingYaw) % 360 + 540) % 360 - 180;
  }
  applyCamera();
}

function searchText(...values) { return values.filter(Boolean).join(" ").toLowerCase(); }

function buildSearchResults(state) {
  if (!state || state.mode !== "LIVE") return [];
  const query = searchQuery.trim().toLowerCase();
  const issueResults = activeIssues(state).map((issue) => {
    const equipment = state.equipment.find((item) => item.id === issue.equipmentId);
    return { type: "ISSUE", id: issue.id, title: issue.id, detail: `Class ${issue.issueClass} · ${statusLabel(issue.status)} · ${equipment?.name ?? issue.equipmentId}`, search: searchText(issue.id, issue.issueClass, issue.status, issue.description, equipment?.name, equipment?.id) };
  });
  const equipmentResults = state.equipment.map((item) => {
    const linked = activeIssues(state).find((issue) => issue.equipmentId === item.id);
    return { type: "EQUIPMENT", id: item.id, title: item.name, detail: `${item.id} · Floor ${item.floor ?? 1} · ${statusLabel(item.status)}${linked ? ` · Current issue ${linked.id}` : ""}`, linkedIssueId: linked?.id ?? null, search: searchText(item.id, item.name, item.status, item.floor, linked?.id, linked?.issueClass) };
  });
  const responderResults = state.responders.map((item) => {
    const assignment = (state.assignments ?? []).find((row) => row.responderId === item.id && row.status === "ACTIVE");
    return { type: "RESPONDER", id: item.id, title: item.name, detail: `${item.id} · Floor ${item.floor ?? 1} · ${statusLabel(item.availability)}${assignment ? ` · Assigned to ${assignment.issueId}` : ""}`, linkedIssueId: assignment?.issueId ?? null, search: searchText(item.id, item.name, item.availability, item.floor, assignment?.issueId) };
  });
  const all = [...issueResults, ...equipmentResults, ...responderResults];
  if (!query) {
    const selected = issueResults.find((result) => result.id === selectedIssueId);
    const relevantEquipment = equipmentResults.filter((result) => result.linkedIssueId);
    const assigned = responderResults.filter((result) => result.linkedIssueId);
    return [...new Map([...([selected].filter(Boolean)), ...issueResults.slice(0, 4), ...relevantEquipment.slice(0, 4), ...assigned.slice(0, 4)].map((result) => [`${result.type}:${result.id}`, result])).values()];
  }
  return all.filter((result) => result.search.includes(query));
}

function renderSearchPalette() {
  const results = buildSearchResults(currentState).filter((result) => searchFilter === "ALL" || result.type === searchFilter);
  const capped = ["ISSUE", "EQUIPMENT", "RESPONDER"].flatMap((type) => results.filter((result) => result.type === type).slice(0, 5));
  searchActiveIndex = Math.min(searchActiveIndex, Math.max(0, capped.length - 1));
  elements["control-search-input"].setAttribute("aria-activedescendant", capped[searchActiveIndex] ? `control-search-result-${capped[searchActiveIndex].type}-${capped[searchActiveIndex].id}` : "");
  elements["control-search-filters"].querySelectorAll("[data-search-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.searchFilter === searchFilter)));
  const groups = ["ISSUE", "EQUIPMENT", "RESPONDER"].map((type) => {
    const group = capped.filter((result) => result.type === type);
    if (!group.length) return "";
    const label = type === "ISSUE" ? "Current issues" : type === "EQUIPMENT" ? "Equipment" : "Personnel";
    return `<section class="search-result-group"><h3>${label}</h3>${group.map((result) => {
      const index = capped.indexOf(result);
      const linked = result.linkedIssueId ? `<span class="search-linked">View current issue ${escapeHtml(result.linkedIssueId)}</span>` : "";
      return `<button id="control-search-result-${escapeHtml(result.type)}-${escapeHtml(result.id)}" type="button" role="option" aria-selected="${index === searchActiveIndex}" class="search-result ${index === searchActiveIndex ? "active" : ""}" data-search-result-type="${result.type}" data-search-result-id="${escapeHtml(result.id)}"><strong>${escapeHtml(result.title)}</strong><span>${escapeHtml(result.detail)}</span>${linked}</button>`;
    }).join("")}</section>`;
  }).join("");
  setHtml(elements["control-search-results"], groups || `<p class="workflow-prompt">No matching current issues, equipment, or personnel.</p>`);
  elements["control-search-results"].querySelectorAll("[data-search-result-type]").forEach((button) => { button.onclick = () => selectSearchResult(button.dataset.searchResultType, button.dataset.searchResultId); });
}

function openSearchPalette() {
  if (!currentState || currentState.mode !== "LIVE" || currentView !== "control") return;
  searchReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : elements["open-control-search"];
  searchOpen = true;
  searchActiveIndex = 0;
  elements["control-search-palette"].hidden = false;
  renderSearchPalette();
  elements["control-search-input"].focus();
}

function closeSearchPalette() {
  if (!searchOpen) return;
  searchOpen = false;
  elements["control-search-palette"].hidden = true;
  searchReturnFocus?.focus?.();
}

/** Ask Compass citations navigate to the cited record. */
function navigateToCitation(kind, id) {
  if (kind === "issue") return selectSearchResult("ISSUE", id);
  if (kind === "responder") return selectSearchResult("RESPONDER", id);
  if (kind === "analytics") return switchView("analytics");
  if (kind === "investigation") { selectInvestigation(id); switchView("control"); render(currentState); workspaceNav?.show("staffing", true); return; }
  if (kind === "event") { const event = (currentState.operationalEvents ?? []).find((entry) => entry.id === id); if (event) { switchView("control"); openEventDetail(event); workspaceNav?.show("issues", true); } }
}

function selectSearchResult(type, id) {
  if (type === "ISSUE") {
    const issue = currentState.issues.find((entry) => entry.id === id);
    selectedIssueId = id;
    clearEventSelection();
    if (issue) { selectedStationId = issue.equipmentId; selectedResponderId = null; focusEntity("equipment", issue.equipmentId); }
  } else if (type === "EQUIPMENT") selectStation(id); else { selectedResponderId = id; focusEntity("responder", id); }
  closeSearchPalette();
  render(currentState);
  workspaceNav?.show("issues", true);
}

function chooseIssue(state) {
  const active = activeIssues(state);
  const selected = state.issues.find((issue) => issue.id === selectedIssueId);
  // Leaving the audit trail open without its issue would render another issue's
  // record under the selected event, so drop back to the current view instead.
  if (showingAuditTrail && selectedEventSnapshot?.issueId && !selected) clearEventSelection();
  if (showingAuditTrail && selected) return selected;
  if (showingAuditTrail) return null;
  if (!active.some((issue) => issue.id === selectedIssueId)) selectedIssueId = active.find((issue) => issue.status === "OFFER_PENDING")?.id ?? active.find((issue) => issue.status === "RECOMMENDATION_READY")?.id ?? active[0]?.id ?? null;
  const chosen = active.find((issue) => issue.id === selectedIssueId) ?? null;
  if (!selectedStationId && chosen) selectedStationId = chosen.equipmentId;
  return chosen;
}

function renderIssues(state) {
  const issues = activeIssues(state);
  setHtml(elements["issue-list"], issues.length ? issues.map((issue) => `<button type="button" class="issue-card ${issue.id === selectedIssueId ? "selected" : ""}" data-issue-id="${escapeHtml(issue.id)}"><span class="issue-row-heading"><strong>${escapeHtml(state.equipment.find((item) => item.id === issue.equipmentId)?.name ?? issue.equipmentId)}</strong>${issue.priorityBand ? `<span class="status-badge ${issue.priorityBand==='HIGH'?'status-attention':''}">${escapeHtml(statusLabel(issue.priorityBand))} priority</span>` : ''}</span><span class="issue-row-description">${escapeHtml(issue.description ?? `Class ${issue.issueClass} issue`)}</span><span class="issue-row-meta"><span>${escapeHtml(issue.id)} · Class ${escapeHtml(issue.issueClass)}</span><span>${statusLabel(issue.status)}</span></span></button>`).join("") : `<div class="empty-state"><strong>No active issues</strong><p>The floor has no issues awaiting a response.</p></div>`);
  document.querySelectorAll("[data-issue-id]").forEach((button) => { button.onclick = () => { const issue = state.issues.find((entry) => entry.id === button.dataset.issueId); selectedIssueId = button.dataset.issueId; clearEventSelection(); if (issue) selectStation(issue.equipmentId); render(currentState); }; });
}

function renderEvents(state) {
  setHtml(elements["event-feed"], [...(state.operationalEvents ?? [])].slice(-14).reverse().map((event) => {
    const disagreement = event.eventType === "COMPASS_RECOMMENDATION" && (!event.payload.nearestAgreement || !event.payload.naiveAgreement);
    const issue = state.issues.find((entry) => entry.id === event.issueId);
    const details = event.eventType === "COMPASS_RECOMMENDATION"
      ? `Compass → ${responderName(state, event.payload.compassWinner)} · Naive → ${responderName(state, event.payload.naiveWinner)}`
      : event.eventType === "ISSUE_RAISED"
        ? [event.issueId, event.payload?.description ?? issue?.description].filter(Boolean).join(" · ")
        : event.eventType === "ISSUE_RESOLVED"
          ? [event.issueId, event.responderId ? responderName(state, event.responderId) : null, event.payload?.actionTaken].filter(Boolean).join(" · ")
          : [event.issueId, event.responderId ? responderName(state, event.responderId) : null].filter(Boolean).join(" · ");
    const selected = event.id === selectedEventId;
    const target = event.issueId ? `${event.eventType} for ${event.issueId}` : `${event.eventType} event`;
    return `<button id="feed-${escapeHtml(event.id)}" type="button" class="feed-event ${disagreement ? "disagreement" : ""} ${selected ? "selected" : ""}" data-feed-event-id="${escapeHtml(event.id)}" ${event.issueId ? `data-feed-issue-id="${escapeHtml(event.issueId)}"` : ""} aria-label="View details for ${escapeHtml(target)}" aria-pressed="${selected}" ${selected ? `aria-current="true"` : ""}><span class="event-marker" aria-hidden="true"></span><time>${escapeHtml(new Date(event.simulationTimestamp).toISOString().slice(11, 16))}</time><span class="feed-event-copy"><strong>${disagreement ? "⚡ Compass disagreement" : ({STAFFING_RECOMMENDATION_READY:"Staffing recommendation ready",STAFFING_APPROVED:"Approved by central command",STAFFING_REJECTED:"Rejected",STAFFING_EXPIRED:"Expired",STAFFING_AUTO_APPROVED:"Auto-approved by policy"}[event.eventType] ?? statusLabel(event.eventType))}</strong><span>${escapeHtml(details)}</span></span></button>`;
  }).join(""));
  document.querySelectorAll("[data-feed-event-id]").forEach((button) => { button.onclick = () => {
    const event = (currentState.operationalEvents ?? []).find((entry) => entry.id === button.dataset.feedEventId);
    if (event) openEventDetail(event);
  }; });
}

function responderRow(responder) {
  return `<button type="button" class="responder-row ${responder.id === selectedResponderId ? "selected" : ""}" data-responder-id="${escapeHtml(responder.id)}"><span class="availability-marker ${responder.availability.toLowerCase()}"></span><span>${escapeHtml(responder.name)}</span><span class="responder-status">${statusLabel(responder.availability)}</span></button>`;
}

function renderResponders(state) {
  const onShift = state.responders.filter((responder) => responder.availability !== "UNAVAILABLE");
  const offShift = state.responders.filter((responder) => responder.availability === "UNAVAILABLE");
  setHtml(elements["responder-list"], `${onShift.map(responderRow).join("") || '<p class="workflow-prompt">No personnel are currently on shift.</p>'}<details class="off-shift-personnel"><summary>Off shift (${offShift.length})</summary><div class="off-shift-list">${offShift.map(responderRow).join("")}</div></details>`);
  document.querySelectorAll("[data-responder-id]").forEach((button) => { button.onclick = () => { selectedResponderId = button.dataset.responderId; focusEntity("responder", selectedResponderId); render(currentState); }; });
}

function fixSourceLabel(source) { return source === "NEBIUS_MODEL" ? "Nebius model" : source === "AMD_MODEL" ? "AMD model" : source === "FIXTURE" ? "Offline fixture" : "Deterministic"; }
function recommendedFixMarkup(issue, state) {
  const rec = issue.fixRecommendation ?? state.issues.find((row) => row.id === issue.id)?.fixRecommendation;
  if (!issue.symptom && !rec) return "";
  const symptom = issue.symptom ? `<p><strong>Observed symptom:</strong> ${escapeHtml(issue.symptom.code)} · ${escapeHtml(issue.symptom.text)}</p>` : "";
  if (!rec?.packet || !rec.rankedFixes?.length) return `<section class="fix-panel"><h3>Recommended fix</h3>${symptom}<p>Open the complete issue record for saved troubleshooting evidence.</p></section>`;
  const candidates = rec.packet.candidates;
  const top = candidates.find((c) => c.fixId === rec.rankedFixes[0].fixId);
  const baseline = candidates.find((c) => c.fixId === rec.baselineFixId);
  const active = state.resolutionAttempts?.find((a) => a.issueId === issue.id && a.status === "ACTIVE");
  const ranking = rec.rankedFixes.map((r) => { const c = candidates.find((c) => c.fixId === r.fixId); return `<li><strong>${escapeHtml(c.fixId)} · ${escapeHtml(c.title)}</strong><p>${escapeHtml(r.rationale)}</p><p>${escapeHtml(c.steps)}</p></li>`; }).join("");
  const rows = candidates.map((c) => `<tr><td>${escapeHtml(c.fixId)}</td><td>${c.sameSymptom.successes}/${c.sameSymptom.attempts}</td><td>${c.sameSymptom.firstTimeSuccesses}/${c.sameSymptom.firstAttempts}</td><td>${Math.round(c.sameSymptom.smoothedSuccess * 100)}%</td><td>${formatMinutes(c.sameSymptom.medianMinutes)}</td><td>${c.sameClass.attempts} / ${c.sameEquipment.attempts}</td><td>${escapeHtml(c.sameSymptom.lastUsed ?? "Never")}</td></tr>`).join("");
  return `<section class="fix-panel" aria-label="Recommended fix"><h3>Recommended fix</h3>${symptom}<p class="fix-source">Source: ${escapeHtml(fixSourceLabel(rec.source))}${rec.status === "PENDING_MODEL" ? " · Model ranking in progress; work uses the deterministic order." : ""}</p><strong>${escapeHtml(top.fixId)} · ${escapeHtml(top.title)}</strong><p>${escapeHtml(rec.rankedFixes[0].rationale)}</p><p>${escapeHtml(top.steps)}</p><p>Class-frequency baseline: ${escapeHtml(baseline?.title ?? rec.baselineFixId)} · ${rec.disagreement ? "Disagrees with baseline" : "Agrees with baseline"}</p>${active?.fixApplied ? `<p><strong>Applied this attempt:</strong> ${escapeHtml(active.fixApplied.id)} · ${escapeHtml(active.fixApplied.title)} · ${escapeHtml(fixSourceLabel(active.fixDecision?.source))}${active.fixDecision?.reason === "model-not-ready" ? " (model was not ready when work began)" : ""}</p>` : active ? `<p><strong>Applied this attempt:</strong> Legacy action. New recommendations do not change work already underway.</p>` : ""}<details><summary>Troubleshooting order and evidence</summary><ol class="fix-order">${ranking}</ol><div class="evidence-scroll"><table class="evidence-table"><caption>Observed fix evidence · same symptom unless noted; smoothed success uses a neutral prior</caption><thead><tr><th>Fix</th><th>Success / attempts</th><th>First-time / first attempts</th><th>Smoothed success</th><th>Median</th><th>Class / equipment attempts</th><th>Last used</th></tr></thead><tbody>${rows}</tbody></table></div></details></section>`;
}
function fixAuditMarkup(record) {
  const rows = record.resolutionHistory ?? [];
  if (!rows.length) return "";
  return `<section class="audit-section"><h4>Applied fixes by attempt</h4><ol class="audit-list">${rows.map((r) => `<li><strong>${r.fixApplied ? `${escapeHtml(r.fixApplied.id)} · ${r.success ? "Succeeded" : "Failed — try next fix"}` : "Legacy action — excluded from fix evidence"}</strong>${r.fixApplied ? `<span>Source: ${escapeHtml(fixSourceLabel(r.fixDecision?.source))} · Attempt ${r.fixAttemptNumber ?? "—"}</span>` : ""}<p>${escapeHtml(r.actionTaken ?? "No action was recorded.")}</p></li>`).join("")}</ol></section>`;
}
function fixRate(metric) {
  return metric.status === "INSUFFICIENT_DATA" ? `Insufficient data (n=${metric.denominator})` : `${(metric.rate * 100).toFixed(1)}% (n=${metric.denominator})`;
}
function fixAnalyticsPanel(analytics) {
  const f = analytics.fixes;
  if (!f) return "";
  return `<section id="analytics-reliability" class="analytics-panel"><p class="eyebrow">Lifetime observed outcomes</p><h3>Fix recommendations and outcomes</h3><div class="metric-grid"><div><span>First-time fix rate</span><strong>${metricValue(f.firstTimeFixRate, fixRate)}</strong></div><div><span>Recommended vs baseline agreement</span><strong>${metricValue(f.recommendedVsBaselineAgreement, fixRate)}</strong></div></div><p class="workflow-prompt">${escapeHtml(f.definition)} Model recommendations (Nebius or AMD): ${f.modelRecommendations}; deterministic recommendations: ${f.deterministicRecommendations}.</p></section>`;
}
function fixPeriodTable(period) {
  if (!period?.periods?.some((p) => p.fixes)) return "";
  return `<div class="evidence-scroll"><table class="analytics-table"><caption>First-time fix rate by ${escapeHtml(period.level.toLowerCase())} · completed first attempts; legacy actions excluded</caption><thead><tr><th>Period</th><th>Coverage</th><th>First-time fix rate</th><th>Recommended vs baseline</th></tr></thead><tbody>${period.periods.map((p) => `<tr><td>${escapeHtml(p.start.slice(0,10))}</td><td>${escapeHtml(statusLabel(p.status))}</td><td>${fixRate(p.fixes.firstTimeFixRate)}</td><td>${fixRate(p.fixes.recommendedVsBaselineAgreement)}</td></tr>`).join("")}</tbody></table></div>`;
}

function stationIssues(state, stationId) { return state.issues.filter((issue) => issue.equipmentId === stationId && issue.status !== "RESOLVED").sort((a, b) => String(a.raisedAt).localeCompare(String(b.raisedAt)) || a.id.localeCompare(b.id)); }
const stationHistoryCache = new Map();
function knownIssues(state) {
  const rows = [...stationHistoryCache.values()].flatMap((entry) => entry.issues);
  return [...new Map([...rows, ...state.issues, ...(stationHistoryAuditRecord?.issue?.status === "RESOLVED" ? [stationHistoryAuditRecord.issue] : [])].map((row) => [row.id, row])).values()];
}
function loadStationHistory(stationId, more = false) {
  const previous = stationHistoryCache.get(stationId);
  if (previous?.loading) return;
  const entry = { issues: previous?.issues ?? [], next: previous?.next ?? null, total: previous?.total ?? null, loading: true };
  stationHistoryCache.set(stationId, entry);
  void roomApi(`/equipment/${encodeURIComponent(stationId)}/issues${more && entry.next ? `?before=${encodeURIComponent(entry.next)}` : ""}`).then((page) => {
    if (stationHistoryCache.get(stationId) !== entry) return;
    entry.issues = more ? [...entry.issues, ...page.issues] : page.issues;
    entry.next = page.next; entry.total = page.total ?? entry.issues.length; entry.loading = false;
    if (selectedStationId === stationId) render(currentState);
  }).catch(() => { entry.loading = false; });
}
function stationIssueHistory(state, stationId) {
  return knownIssues(state).filter((issue) => issue.equipmentId === stationId).sort((left, right) => {
    const leftTime = Date.parse(left.resolvedAt ?? left.raisedAt) || 0;
    const rightTime = Date.parse(right.resolvedAt ?? right.raisedAt) || 0;
    return rightTime - leftTime || right.id.localeCompare(left.id);
  });
}
function stationIssueHistoryMarkup(state, station) {
  if (state.mode === "LIVE" && !stationHistoryCache.has(station.id)) loadStationHistory(station.id);
  const records = stationIssueHistory(state, station.id);
  const total = Math.max(stationHistoryCache.get(station.id)?.total ?? 0, state.stationMetrics?.[station.id]?.issueCount ?? 0, records.length);
  const recent = records.slice(0, 5);
  const earlier = records.slice(5);
  const row = (issue) => {
    const timestamp = issue.resolvedAt ?? issue.raisedAt;
    const result = issue.status === "RESOLVED" ? "Resolved" : statusLabel(issue.status);
    return `<button type="button" class="station-history-row" data-station-history-issue-id="${escapeHtml(issue.id)}"><strong>${escapeHtml(issue.id)}</strong><span>${escapeHtml(result)} · ${escapeHtml(new Date(timestamp).toISOString().replace("T", " ").slice(0, 16))}</span><span>${escapeHtml(issue.description ?? `Class ${issue.issueClass} issue`)}</span></button>`;
  };
  const rows = recent.length ? recent.map(row).join("") : `<p class="workflow-prompt">No issues have been recorded for this station.</p>`;
  return `<details class="station-issue-history" open><summary>Observed issues (${total})</summary><div class="station-history-scroll" role="list" aria-label="Recent issue records for ${escapeHtml(station.name)}">${rows}</div>${earlier.length ? `<details class="station-issue-history-earlier"><summary>Earlier issues (${Math.max(earlier.length, total - recent.length)})</summary><div class="station-history-scroll" role="list" aria-label="Earlier issue records for ${escapeHtml(station.name)}">${earlier.map(row).join("")}</div></details>` : ""}${stationHistoryCache.get(station.id)?.next ? `<button type="button" class="secondary-button" data-station-history-more>Show older records</button>` : ""}</details>`;
}
function clearStationHistorySelection() {
  selectedStationHistoryIssueId = null;
  stationHistoryAuditRecord = null;
  stationHistoryAuditError = null;
  stationHistoryAuditLoading = false;
  stationHistoryAuditSignature = null;
  stationHistoryAuditRequestSequence += 1;
}
function requestStationHistoryAudit(issueId, signature) {
  const requestSequence = ++stationHistoryAuditRequestSequence;
  stationHistoryAuditSignature = signature;
  stationHistoryAuditLoading = true;
  stationHistoryAuditError = null;
  void roomApi(`/issues/${encodeURIComponent(issueId)}/audit`).then((record) => {
    if (selectedStationHistoryIssueId !== issueId || requestSequence !== stationHistoryAuditRequestSequence) return;
    stationHistoryAuditRecord = record;
    stationHistoryAuditLoading = false;
    render(currentState);
  }).catch((error) => {
    reportClientError(`/api/issues/${issueId}/audit`, error);
    if (selectedStationHistoryIssueId !== issueId || requestSequence !== stationHistoryAuditRequestSequence) return;
    stationHistoryAuditError = error.message;
    stationHistoryAuditLoading = false;
    render(currentState);
  });
}
function openStationHistoryIssue(issueId) {
  const issue = currentState && knownIssues(currentState).find((entry) => entry.id === issueId && entry.equipmentId === selectedStationId);
  if (!issue) return;
  selectedIssueId = issue.id;
  clearEventSelection();
  selectedStationHistoryIssueId = issue.id;
  stationHistoryAuditRecord = null;
  stationHistoryAuditError = null;
  stationHistoryAuditLoading = false;
  stationHistoryAuditSignature = null;
  requestStationHistoryAudit(issue.id, issueAuditSignature(currentState, issue.id));
  render(currentState);
}
function bindStationIssueHistory(state) {
  document.querySelector("[data-station-history-more]")?.addEventListener("click", () => loadStationHistory(selectedStationId, true));
  document.querySelectorAll("[data-station-history-issue-id]").forEach((button) => {
    button.onclick = () => {
      const issue = knownIssues(state).find((entry) => entry.id === button.dataset.stationHistoryIssueId && entry.equipmentId === selectedStationId);
      if (!issue) return;
      if (issue.status === "RESOLVED") { openStationHistoryIssue(issue.id); return; }
      clearStationHistorySelection();
      selectedIssueId = issue.id;
      clearEventSelection();
      focusEntity("equipment", issue.equipmentId);
      render(currentState);
    };
  });
}
function selectStation(id) { const station = currentState?.equipment.find((entry) => entry.id === id); if (!station) return; selectedStationId = id; selectedResponderId = null; clearStationHistorySelection(); const issue = stationIssues(currentState, id)[0]; if (issue) selectedIssueId = issue.id; focusEntity("equipment", id); }
function renderStations(state) {
  const row = (station) => { const issues = stationIssues(state, station.id); return `<button type="button" class="station-row ${station.id === selectedStationId ? "selected" : ""}" data-station-id="${escapeHtml(station.id)}"><span><strong>${escapeHtml(station.name)}</strong>${issues.length ? `<span class="station-issues">${issues.map((issue) => escapeHtml(issue.id)).join(", ")}</span>` : ""}</span><span class="station-status">${issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "Healthy"}</span></button>`; };
  const affected = state.equipment.filter((station) => stationIssues(state, station.id).length).sort((a, b) => a.id.localeCompare(b.id));
  const healthy = state.equipment.filter((station) => !stationIssues(state, station.id).length).sort((a, b) => a.id.localeCompare(b.id));
  setHtml(elements["station-list"], `${affected.map(row).join("") || '<p class="workflow-prompt">No stations currently have issues.</p>'}<details class="healthy-stations"><summary>Healthy stations (${healthy.length})</summary><div>${healthy.map(row).join("")}</div></details>`);
  document.querySelectorAll("[data-station-id]").forEach((button) => { button.onclick = () => { selectStation(button.dataset.stationId); render(currentState); }; });
}
function renderSidebarTabs() { const personnel = sidebarTab === "personnel"; elements["personnel-tab"].setAttribute("aria-selected", String(personnel)); elements["stations-tab"].setAttribute("aria-selected", String(!personnel)); elements["responder-list"].hidden = !personnel; elements["station-list"].hidden = personnel; elements["personnel-tab"].onclick = () => { sidebarTab = "personnel"; renderSidebarTabs(); }; elements["stations-tab"].onclick = () => { sidebarTab = "stations"; renderSidebarTabs(); }; }

function evidenceTable(recommendation, rankedCandidates = null) {
  const ranking = rankedCandidates ?? recommendation.candidateEvidenceSnapshot.map((candidate, index) => ({ responderId: candidate.responderId, rank: index + 1 }));
  return `<div class="evidence-scroll"><table class="evidence-table"><caption>Eligible responder evidence</caption><thead><tr><th>Candidate</th><th>Solo / assisted</th><th>Evidence weight</th><th>Strength</th><th>Median</th><th>Success</th><th>Travel</th></tr></thead><tbody>${ranking.map((ranked) => {
    const evidence = recommendation.candidateEvidenceSnapshot.find((candidate) => candidate.responderId === ranked.responderId);
    return `<tr class="${ranked.rank === 1 ? "recommended-row" : ""}"><td><strong>${ranked.rank}. ${escapeHtml(evidence.displayName)}</strong></td><td>${evidence.soloHistoricalCount ?? evidence.sameIssueHistoricalCount} / ${evidence.assistedHistoricalCount ?? 0}</td><td>${Number(evidence.effectiveEvidenceWeight ?? evidence.sameIssueHistoricalCount).toFixed(1)}</td><td><span class="evidence-strength ${evidence.evidenceStrengthLabel.toLowerCase()}">${evidence.evidenceStrengthLabel}</span></td><td>${formatMinutes(evidence.medianResolutionMinutes)}</td><td>${formatPercent(evidence.successRate, evidence.effectiveEvidenceWeight ?? evidence.sameIssueHistoricalCount)}</td><td>${Number(evidence.travelTimeMinutes).toFixed(1)} min</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function dispatchNarrative(state, issue, recommendation, offers) {
  const assignedName = responderName(state, issue.assignedResponderId ?? recommendation?.acceptedResponderId);
  if (recommendation?.decision === "OVERRIDDEN") return `Control center overrode the offer queue and assigned ${assignedName}.`;
  const accepted = offers.find((offer) => offer.status === "ACCEPTED");
  const rejected = offers.filter((offer) => offer.status === "REJECTED");
  if (accepted && accepted.rank === 1 && rejected.length === 0) return `${responderName(state, accepted.responderId)} accepted as the top Compass match.`;
  if (accepted) return `${rejected.length} earlier offer${rejected.length === 1 ? " was" : "s were"} rejected before ${responderName(state, accepted.responderId)} accepted match ${accepted.rank}.`;
  if (offers.some((offer) => offer.status === "PENDING")) return `An offer is currently waiting for a responder decision.`;
  if (issue.assignedResponderId) return `${assignedName} was assigned through the recorded canonical assignment path.`;
  return `No responder has accepted this issue yet.`;
}

function clearEventSelection() {
  showingAuditTrail = false;
  selectedEventId = null;
  selectedEventSnapshot = null;
  auditRecord = null;
  auditError = null;
  auditLoading = false;
  auditRequestedSignature = null;
  auditRequestSequence += 1;
}

function issueAuditSignature(state, issueId) {
  return JSON.stringify({
    issue: state.issues.find((entry) => entry.id === issueId) ?? null,
    recommendations: (state.recommendations ?? []).filter((entry) => entry.issueId === issueId),
    offers: (state.dispatchOffers ?? []).filter((entry) => entry.issueId === issueId),
    assignments: (state.assignments ?? []).filter((entry) => entry.issueId === issueId),
    attempts: (state.resolutionAttempts ?? []).filter((entry) => entry.issueId === issueId),
    events: (state.operationalEvents ?? []).filter((entry) => entry.issueId === issueId),
  });
}

function requestIssueAudit(issueId, eventId, signature) {
  const requestSequence = ++auditRequestSequence;
  auditRequestedSignature = signature;
  auditLoading = true;
  auditError = null;
  void roomApi(`/issues/${encodeURIComponent(issueId)}/audit`).then((record) => {
    if (!showingAuditTrail || selectedIssueId !== issueId || selectedEventId !== eventId || requestSequence !== auditRequestSequence) return;
    auditRecord = record;
    auditLoading = false;
    render(currentState);
  }).catch((error) => {
    reportClientError(`/api/issues/${issueId}/audit`, error);
    if (!showingAuditTrail || selectedIssueId !== issueId || selectedEventId !== eventId || requestSequence !== auditRequestSequence) return;
    auditError = error.message;
    auditLoading = false;
    render(currentState);
  });
}

function openEventDetail(event) {
  const previousIssueId = selectedIssueId;
  selectedIssueId = event.issueId ?? null;
  selectedEventId = event.id;
  selectedEventSnapshot = structuredClone(event);
  showingAuditTrail = true;
  auditError = null;
  if (!event.issueId) {
    auditRecord = null;
    auditLoading = false;
    auditRequestedSignature = null;
    auditRequestSequence += 1;
  } else {
    if (previousIssueId !== event.issueId || auditRecord?.issue?.id !== event.issueId) auditRecord = null;
    requestIssueAudit(event.issueId, event.id, issueAuditSignature(currentState, event.issueId));
  }
  render(currentState);
}

function closeAuditTrail() {
  selectedIssueId = null;
  clearEventSelection();
  render(currentState);
}

function selectedOperationalEvent(state) {
  return (auditRecord?.operationalEvents ?? []).find((event) => event.id === selectedEventId)
    ?? (state.operationalEvents ?? []).find((event) => event.id === selectedEventId)
    ?? (selectedEventSnapshot?.id === selectedEventId ? selectedEventSnapshot : null);
}

function eventDetailNarrative(state, event, issue) {
  const payload = event.payload ?? {};
  const equipment = state.equipment.find((entry) => entry.id === (event.equipmentId ?? issue?.equipmentId));
  const responder = event.responderId ? responderName(state, event.responderId) : null;
  switch (event.eventType) {
    case "ISSUE_RAISED": return [event.issueId ? `${event.issueId} was raised` : "An issue was raised", equipment?.name ? `at ${equipment.name}` : null, payload.issueClass ? `Class ${payload.issueClass}` : null, payload.description ?? issue?.description, payload.contextReason].filter(Boolean).join(" · ");
    case "COMPASS_RECOMMENDATION": return [`Compass recommended ${responderName(state, payload.compassWinner)}`, payload.nearestWinner ? `nearest was ${responderName(state, payload.nearestWinner)}` : null, payload.naiveWinner ? `naive score was ${responderName(state, payload.naiveWinner)}` : null, payload.purpose === "ASSISTANCE" ? "support matching" : null].filter(Boolean).join(" · ");
    case "RESPONDER_ASSIGNED": return [`${responder ?? "A responder"} was assigned`, event.issueId ? `to ${event.issueId}` : null, payload.role ? `as ${statusLabel(payload.role)}` : null].filter(Boolean).join(" ");
    case "ASSIGNMENT_OVERRIDDEN": return [`Control center assigned ${responder ?? "the selected responder"}`, event.issueId ? `to ${event.issueId}` : null].filter(Boolean).join(" ");
    case "ISSUE_RESOLVED": return [`${event.issueId ?? "The issue"} was resolved`, responder ? `by ${responder}` : null, payload.resolutionMinutes == null ? null : `in ${formatMinutes(payload.resolutionMinutes)}`, payload.actionTaken].filter(Boolean).join(" · ");
    case "ISSUE_REOPENED": return [`${event.issueId ?? "The issue"} was reopened after an unsuccessful attempt`, responder ? `by ${responder}` : null, payload.actionTaken].filter(Boolean).join(" · ");
    case "ASSISTANCE_REQUESTED": return [`Support was requested for ${event.issueId}`, payload.trigger ? statusLabel(payload.trigger) : null].filter(Boolean).join(" · ");
    case "RESPONDER_JOINED": return [`${responder ?? "A responder"} joined ${event.issueId}`, payload.role ? `as ${statusLabel(payload.role)}` : null].filter(Boolean).join(" ");
    case "RESPONDER_RELEASED": return [`${responder ?? "A responder"} was released from ${event.issueId}`, payload.reason ? statusLabel(payload.reason) : null].filter(Boolean).join(" · ");
    case "RESPONDER_TRANSFERRED": return [`${responder ?? "A responder"} was transferred to ${event.issueId}`, payload.sourceIssueId ? `from ${payload.sourceIssueId}` : null].filter(Boolean).join(" · ");
    case "PRIMARY_CHANGED": return [`${responder ?? "A responder"} became primary for ${event.issueId}`].join("");
    case "RESOLUTION_REPLANNED": return [`Resolution timing was replanned for ${event.issueId}`, payload.reason ? statusLabel(payload.reason) : null].filter(Boolean).join(" · ");
    case "SIMULATION_STARTED": return "The persistent simulation started from its seeded operational state.";
    case "SIMULATION_PAUSED": return payload.reason === "OPERATOR_INACTIVITY" ? `The simulation clock was paused automatically after ${formatMinutes(payload.idleMinutes)} without operator activity; canonical floor state was preserved.` : "The simulation clock was paused; canonical floor state was preserved.";
    case "SIMULATION_RESUMED": return "The simulation clock resumed from its persisted timestamp.";
    default: return [event.issueId, responder, equipment?.name].filter(Boolean).join(" · ") || "A recorded operational state transition occurred.";
  }
}

function renderSelectedEventSummary(state, event, issue) {
  if (!event) return `<div class="event-detail-summary"><p class="eyebrow">Selected event</p><h3>Event record unavailable</h3><p>The selected row is no longer present in the public snapshot.</p></div>`;
  return `<div class="event-detail-summary" tabindex="-1"><p class="eyebrow">Selected event</p><h3>${escapeHtml(statusLabel(event.eventType))}</h3><p>${escapeHtml(eventDetailNarrative(state, event, issue))}</p><dl><div><dt>Simulation time</dt><dd>${escapeHtml(new Date(event.simulationTimestamp).toISOString().replace("T", " ").slice(0, 16))}</dd></div><div><dt>Source</dt><dd>${escapeHtml(statusLabel(event.source))}</dd></div></dl></div>`;
}

function renderIssueAuditTrail(state, issue) {
  elements["context-eyebrow"].textContent = "Selected event";
  elements["issue-heading"].textContent = "Event detail";
  const event = selectedOperationalEvent(state);
  setHtml(elements["issue-summary"], renderSelectedEventSummary(state, event, issue));
  if (!issue) {
    setHtml(elements["baseline-panel"], "");
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card audit-card"><div class="audit-heading"><div><p class="eyebrow">Operational event</p><h3>${escapeHtml(statusLabel(event?.eventType))}</h3></div><button id="close-audit-button" type="button" class="secondary-button">Return to current view</button></div><p>This system event is not attached to an issue chronology.</p></section>`);
    document.querySelector("#close-audit-button").onclick = closeAuditTrail;
    return;
  }
  const signature = issueAuditSignature(state, issue.id);
  if (!auditLoading && signature !== auditRequestedSignature) requestIssueAudit(issue.id, selectedEventId, signature);
  if (auditError) {
    setHtml(elements["baseline-panel"], "");
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card audit-card"><div class="audit-heading"><div><p class="eyebrow">Issue audit trail</p><h3>${escapeHtml(issue.id)}</h3></div><button id="close-audit-button" type="button" class="secondary-button">Return to current view</button></div><p class="load-error">${escapeHtml(auditError)}</p></section>`);
    document.querySelector("#close-audit-button").onclick = closeAuditTrail;
    return;
  }
  if (!auditRecord) {
    setHtml(elements["baseline-panel"], "");
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card audit-card" aria-live="polite"><div class="audit-heading"><div><p class="eyebrow">Issue audit trail</p><h3>${escapeHtml(issue.id)}</h3></div><button id="close-audit-button" type="button" class="secondary-button">Return to current view</button></div><p>Loading the complete record for this issue.</p></section>`);
    document.querySelector("#close-audit-button").onclick = closeAuditTrail;
    return;
  }
  const equipment = auditRecord.equipment ?? state.equipment.find((entry) => entry.id === issue.equipmentId);
  const recommendations = auditRecord.recommendations ?? [];
  const recommendation = [...recommendations].reverse().find((entry) => entry.agentResult) ?? recommendations.at(-1);
  const offers = auditRecord.dispatchOffers ?? [];
  const resolutionEvents = (auditRecord.operationalEvents ?? []).filter((event) => ["ISSUE_RESOLVED", "ISSUE_REOPENED"].includes(event.eventType));
  const description = issue.description ?? "Generic operational instability requiring inspection.";
  const responseAction = issue.responseAction ?? resolutionEvents.at(-1)?.payload?.actionTaken ?? "Inspect the affected process, apply the required correction, and verify stable operation.";
  setHtml(elements["baseline-panel"], recommendation ? `<p class="eyebrow">Decision-time baselines</p><div class="baseline-card"><span>Nearest available</span><strong>→ ${escapeHtml(responderName(state, recommendation.nearestWinner))}</strong></div><div class="baseline-card"><span>Naive score</span><strong>→ ${escapeHtml(responderName(state, recommendation.naiveWinner))}</strong></div>` : "");
  const analysis = recommendations.length ? recommendations.map((entry) => entry.agentResult
    ? `<section class="audit-section"><h4>${entry.purpose === "ASSISTANCE" ? "Assistance" : "Initial assignment"} Compass analysis</h4><p><strong>${escapeHtml(responderName(state, entry.agentResult.topRecommendation.responderId))}</strong> was ranked first.</p><p>${escapeHtml(entry.agentResult.topRecommendation.rationale)}</p><p class="tradeoff"><strong>Tradeoff:</strong> ${escapeHtml(entry.agentResult.rankedCandidates.find((candidate) => candidate.rank === 1)?.tradeoff?.explanation ?? entry.agentResult.uncertaintyNote)}</p>${evidenceTable(entry, entry.agentResult.rankedCandidates)}</section>`
    : `<section class="audit-section"><h4>${entry.purpose === "ASSISTANCE" ? "Assistance" : "Initial assignment"} matching</h4><p>Compass was unavailable. Application-owned deterministic matching kept dispatch moving.</p>${evidenceTable(entry)}</section>`).join("")
    : `<section class="audit-section"><h4>Compass analysis</h4><p>No recommendation audit exists for this seeded issue.</p></section>`;
  const offerRows = offers.length
    ? `<ol class="audit-list">${offers.map((offer) => `<li><strong>${offer.purpose === "ASSISTANCE" ? "Support" : "Primary"} match ${offer.rank}: ${escapeHtml(responderName(state, offer.responderId))}</strong><span>${statusLabel(offer.status)}</span></li>`).join("")}</ol>`
    : `<p>No automatic offers were recorded for this issue.</p>`;
  const outcomes = resolutionEvents.length
    ? `<ol class="audit-list">${resolutionEvents.map((event) => `<li><strong>${event.eventType === "ISSUE_RESOLVED" ? "Resolved" : "Attempt unsuccessful — reopened"}</strong><span>${escapeHtml(responderName(state, event.responderId))} · ${formatMinutes(event.payload?.resolutionMinutes)}</span><p><strong>Action taken:</strong> ${escapeHtml(event.payload?.actionTaken ?? responseAction)}</p></li>`).join("")}</ol>`
    : `<p>Resolution is still pending. Planned response: ${escapeHtml(responseAction)}</p>`;
  const staffingEvents = (auditRecord.operationalEvents ?? []).filter((event) => ["ASSISTANCE_REQUESTED", "RESPONDER_JOINED", "RESPONDER_RELEASED", "RESPONDER_TRANSFERRED", "PRIMARY_CHANGED", "RESOLUTION_REPLANNED"].includes(event.eventType));
  const staffingHistory = staffingEvents.length ? `<ol class="audit-list">${staffingEvents.map((event) => `<li><strong>${({STAFFING_RECOMMENDATION_READY:"Staffing recommendation ready",STAFFING_APPROVED:"Approved by central command",STAFFING_REJECTED:"Rejected",STAFFING_EXPIRED:"Expired",STAFFING_AUTO_APPROVED:"Auto-approved by policy"}[event.eventType] ?? statusLabel(event.eventType))}</strong><span>${[event.responderId ? responderName(state, event.responderId) : null, event.payload?.role ? statusLabel(event.payload.role) : null, event.payload?.reason ? statusLabel(event.payload.reason) : null].filter(Boolean).map(escapeHtml).join(" · ")}</span></li>`).join("")}</ol>` : `<p>No staffing changes were recorded.</p>`;
  setHtml(elements["recommendation-panel"], `<section class="recommendation-card audit-card" aria-busy="${auditLoading}"><div class="audit-heading"><div><p class="eyebrow">Full issue chronology · ${escapeHtml(issue.id)}</p><h3>${escapeHtml(description)}</h3>${auditLoading ? `<span class="audit-refresh" role="status">Refreshing chronology…</span>` : ""}</div><button id="close-audit-button" type="button" class="secondary-button">Return to current view</button></div><section class="audit-section"><h4>Dispatch outcome</h4><p>${escapeHtml(dispatchNarrative(state, issue, recommendation, offers))}</p>${offerRows}</section>${analysis}${recommendedFixMarkup(auditRecord.issue, state)}${fixAuditMarkup(auditRecord)}<section class="audit-section"><h4>Staffing chronology</h4>${staffingHistory}</section><section class="audit-section"><h4>Response and resolution</h4><p><strong>Incident note:</strong> ${escapeHtml(responseAction)}</p>${outcomes}</section></section>`);
  document.querySelector("#close-audit-button").onclick = closeAuditTrail;
}

/** Render a resolved station record without taking over the event-feed audit. */
function renderStationHistoryIssueDetail(state, issue) {
  const station = state.equipment.find((entry) => entry.id === selectedStationId);
  const signature = issueAuditSignature(state, issue.id);
  elements["context-eyebrow"].textContent = "Station issue history";
  elements["issue-heading"].textContent = "Issue details";
  setHtml(elements["issue-summary"], `<div class="issue-title-row"><span class="issue-id">${escapeHtml(issue.id)}</span><span class="priority">${escapeHtml(statusLabel(issue.status))}</span></div><h3>${escapeHtml(station?.name ?? issue.equipmentId)}</h3><p>${escapeHtml(issue.description ?? `Class ${issue.issueClass} issue`)}</p><dl><div><dt>Issue class</dt><dd>${escapeHtml(issue.issueClass)}</dd></div><div><dt>Raised</dt><dd>${escapeHtml(new Date(issue.raisedAt).toISOString().replace("T", " ").slice(0, 16))}</dd></div><div><dt>Resolved</dt><dd>${escapeHtml(issue.resolvedAt ? new Date(issue.resolvedAt).toISOString().replace("T", " ").slice(0, 16) : "—")}</dd></div></dl>`);
  if (!stationHistoryAuditLoading && signature !== stationHistoryAuditSignature) requestStationHistoryAudit(issue.id, signature);
  if (stationHistoryAuditError) {
    setHtml(elements["baseline-panel"], "");
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card audit-card"><div class="audit-heading"><div><p class="eyebrow">Station issue record</p><h3>${escapeHtml(issue.id)}</h3></div><button id="return-station-status-button" type="button" class="secondary-button">Return to Station Status</button></div><p class="load-error">${escapeHtml(stationHistoryAuditError)}</p></section>`);
  } else if (!stationHistoryAuditRecord) {
    setHtml(elements["baseline-panel"], "");
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card audit-card" aria-live="polite"><div class="audit-heading"><div><p class="eyebrow">Station issue record</p><h3>${escapeHtml(issue.id)}</h3></div><button id="return-station-status-button" type="button" class="secondary-button">Return to Station Status</button></div><p>Loading the complete record for this issue.</p></section>`);
  } else {
    const record = stationHistoryAuditRecord;
    const recommendations = record.recommendations ?? [];
    const recommendation = [...recommendations].reverse().find((entry) => entry.agentResult) ?? recommendations.at(-1);
    const offers = record.dispatchOffers ?? [];
    const resolutionEvents = (record.operationalEvents ?? []).filter((event) => ["ISSUE_RESOLVED", "ISSUE_REOPENED"].includes(event.eventType));
    const responseAction = issue.responseAction ?? resolutionEvents.at(-1)?.payload?.actionTaken ?? "No response action was recorded.";
    const analysis = recommendations.length ? recommendations.map((entry) => entry.agentResult
      ? `<section class="audit-section"><h4>${entry.purpose === "ASSISTANCE" ? "Assistance" : "Initial assignment"} Compass analysis</h4><p><strong>${escapeHtml(responderName(state, entry.agentResult.topRecommendation.responderId))}</strong> was ranked first.</p><p>${escapeHtml(entry.agentResult.topRecommendation.rationale)}</p>${evidenceTable(entry, entry.agentResult.rankedCandidates)}</section>`
      : `<section class="audit-section"><h4>${entry.purpose === "ASSISTANCE" ? "Assistance" : "Initial assignment"} matching</h4><p>Compass was unavailable. Application-owned deterministic matching kept dispatch moving.</p>${evidenceTable(entry)}</section>`).join("")
      : `<section class="audit-section"><h4>Compass analysis</h4><p>No recommendation audit exists for this issue.</p></section>`;
    const offerRows = offers.length ? `<ol class="audit-list">${offers.map((offer) => `<li><strong>${offer.purpose === "ASSISTANCE" ? "Support" : "Primary"} match ${offer.rank}: ${escapeHtml(responderName(state, offer.responderId))}</strong><span>${statusLabel(offer.status)}</span></li>`).join("")}</ol>` : `<p>No automatic offers were recorded for this issue.</p>`;
    const outcomes = resolutionEvents.length ? `<ol class="audit-list">${resolutionEvents.map((event) => `<li><strong>${event.eventType === "ISSUE_RESOLVED" ? "Resolved" : "Attempt unsuccessful — reopened"}</strong><span>${escapeHtml(responderName(state, event.responderId))} · ${formatMinutes(event.payload?.resolutionMinutes)}</span><p><strong>Action taken:</strong> ${escapeHtml(event.payload?.actionTaken ?? responseAction)}</p></li>`).join("")}</ol>` : `<p>Resolution outcome is not available in this record.</p>`;
    setHtml(elements["baseline-panel"], recommendation ? `<p class="eyebrow">Decision-time baselines</p><div class="baseline-card"><span>Nearest available</span><strong>→ ${escapeHtml(responderName(state, recommendation.nearestWinner))}</strong></div><div class="baseline-card"><span>Naive score</span><strong>→ ${escapeHtml(responderName(state, recommendation.naiveWinner))}</strong></div>` : "");
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card audit-card" aria-busy="${stationHistoryAuditLoading}"><div class="audit-heading"><div><p class="eyebrow">Station issue chronology · ${escapeHtml(issue.id)}</p><h3>${escapeHtml(issue.description ?? `Class ${issue.issueClass} issue`)}</h3></div><button id="return-station-status-button" type="button" class="secondary-button">Return to Station Status</button></div><section class="audit-section"><h4>Dispatch outcome</h4><p>${escapeHtml(dispatchNarrative(state, issue, recommendation, offers))}</p>${offerRows}</section>${analysis}${recommendedFixMarkup(record.issue, state)}${fixAuditMarkup(record)}<section class="audit-section"><h4>Response and resolution</h4><p><strong>Incident note:</strong> ${escapeHtml(responseAction)}</p>${outcomes}</section></section>`);
  }
  document.querySelector("#return-station-status-button")?.addEventListener("click", () => { clearStationHistorySelection(); selectedIssueId = null; render(currentState); });
}

function renderLiveDecision(state, issue) {
  if (showingAuditTrail) { renderIssueAuditTrail(state, issue); return; }
  const station = state.equipment.find((entry) => entry.id === selectedStationId);
  const historicalIssue = station && selectedStationHistoryIssueId ? knownIssues(state).find((entry) => entry.id === selectedStationHistoryIssueId && entry.equipmentId === station.id && entry.status === "RESOLVED") : null;
  if (historicalIssue) { renderStationHistoryIssueDetail(state, historicalIssue); return; }
  if (selectedStationHistoryIssueId) clearStationHistorySelection();
  const stationIssue = station ? stationIssues(state, station.id)[0] : null;
  if (station && !stationIssue) {
    const metrics = state.stationMetrics?.[station.id] ?? {};
    elements["context-eyebrow"].textContent = "Station Status";
    elements["issue-heading"].textContent = "Station status";
    setHtml(elements["issue-summary"], `<div class="issue-title-row"><span class="issue-id">${escapeHtml(station.id)}</span><span class="priority">Healthy</span></div><h3>${escapeHtml(station.name)}</h3><p>This station is currently healthy with no active issues.</p><dl><div><dt>Uptime</dt><dd>${escapeHtml(metrics.uptime ?? "—")}</dd></div><div><dt>MTBF</dt><dd>${escapeHtml(metrics.mtbf ?? "No observed failures")}</dd></div></dl>${stationIssueHistoryMarkup(state, station)}`);
    bindStationIssueHistory(state);
    setHtml(elements["baseline-panel"], ""); setHtml(elements["recommendation-panel"], ""); return;
  }
  elements["context-eyebrow"].textContent = "Station Status";
  elements["issue-heading"].textContent = "Station status";
  if (stationIssue) issue = stationIssue;
  if (!issue) { setHtml(elements["issue-summary"], `<p class="workflow-prompt">No issue currently needs a response.</p>`); setHtml(elements["baseline-panel"], ""); setHtml(elements["recommendation-panel"], ""); return; }
  const equipment = state.equipment.find((entry) => entry.id === issue.equipmentId);
  const queueFacts = [
    issue.priorityBand ? `<div><dt>Queue priority</dt><dd>${escapeHtml(statusLabel(issue.priorityBand))}</dd></div>` : "",
    Number.isFinite(issue.queueWaitingMinutes) ? `<div><dt>Waiting</dt><dd>${escapeHtml(formatMinutes(issue.queueWaitingMinutes))}</dd></div>` : "",
  ].join("");
  const rationale = typeof issue.priorityRationale === "string" && issue.priorityRationale.trim()
    ? `<p class="workflow-prompt"><strong>Queue rationale:</strong> ${escapeHtml(issue.priorityRationale)}</p>`
    : "";
  setHtml(elements["issue-summary"], `<div class="issue-title-row"><span class="issue-id">${escapeHtml(issue.id)}</span><span class="priority">Class ${escapeHtml(issue.issueClass)}</span></div><h3>${escapeHtml(equipment.name)}</h3>${issue.description ? `<p>${escapeHtml(issue.description)}</p>` : ""}<dl><div><dt>Status</dt><dd>${statusLabel(issue.status)}</dd></div><div><dt>Raised</dt><dd>${escapeHtml(new Date(issue.raisedAt).toISOString().slice(11, 16))}</dd></div>${queueFacts}</dl>${rationale}${recommendedFixMarkup(issue, state)}${station ? stationIssueHistoryMarkup(state, station) : ""}`);
  if (station) bindStationIssueHistory(state);
  if (issue.status === "ASSIGNED") {
    setHtml(elements["baseline-panel"], "");
    const supportOffer = (state.dispatchOffers ?? []).find((offer) => offer.issueId === issue.id && offer.status === "PENDING" && offer.purpose === "ASSISTANCE");
    const supportRecommendation = supportOffer ? state.recommendations.find((entry) => entry.id === supportOffer.recommendationId) : null;
    const matching = supportOffer ? `<section class="recommendation-card pending-state"><p class="eyebrow">Support dispatch · Match ${supportOffer.rank}</p><h3>Support offer sent to ${escapeHtml(responderName(state, supportOffer.responderId))}</h3><p>The issue remains actively staffed while this responder accepts or rejects. Rejection advances to the next eligible support match.</p>${supportRecommendation?.agentResult ? `<p>${escapeHtml(supportRecommendation.agentResult.topRecommendation.rationale)}</p>` : ""}</section>` : "";
    setHtml(elements["recommendation-panel"], `${matching}<section class="recommendation-card assignment-success"><p class="eyebrow">Active response</p><h3>${escapeHtml(responderName(state, issue.assignedResponderId))} is primary</h3><p>Roster changes settle completed work and replan the remaining schedule without rerolling timing or success.</p>${staffingControls(state, issue)}</section>`);
    bindStaffingControls(state, issue);
    return;
  }
  if (issue.status === "OFFER_PENDING") {
    const offer = (state.dispatchOffers ?? []).find((entry) => entry.id === issue.pendingOfferId && entry.status === "PENDING");
    const recommendation = offer ? state.recommendations.find((entry) => entry.id === offer.recommendationId) : null;
    const alternatives = recommendation?.candidateEvidenceSnapshot.filter((candidate) => state.responders.find((responder) => responder.id === candidate.responderId)?.availability === "AVAILABLE") ?? [];
    const options = alternatives.map((candidate) => `<option value="${escapeHtml(candidate.responderId)}">${escapeHtml(candidate.displayName)}</option>`).join("");
    const top = recommendation?.agentResult?.rankedCandidates.find((candidate) => candidate.rank === 1);
    const compassExplanation = recommendation?.agentResult
      ? `<p class="rationale">${escapeHtml(recommendation.agentResult.topRecommendation.rationale)}</p><p class="tradeoff"><strong>Tradeoff:</strong> ${escapeHtml(top.tradeoff.explanation)}</p>`
      : `<p class="uncertainty">Compass was unavailable, so application-owned match scoring selected the offer order.</p>`;
    setHtml(elements["baseline-panel"], recommendation ? `<p class="eyebrow">Deterministic baselines</p><div class="baseline-card"><span>Nearest available at match time</span><strong>→ ${escapeHtml(responderName(state, recommendation.nearestWinner))}</strong></div><div class="baseline-card"><span>Naive score at match time</span><strong>→ ${escapeHtml(responderName(state, recommendation.naiveWinner))}</strong></div>` : "");
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card pending-state" aria-live="polite"><p class="eyebrow">Automatic dispatch · Match ${escapeHtml(offer?.rank ?? "—")}</p><h3>Offer sent to ${escapeHtml(responderName(state, issue.offeredResponderId))}</h3><p>Waiting asynchronously for the responder to accept or reject. A rejection automatically advances to the next eligible match.</p>${compassExplanation}${recommendation ? evidenceTable(recommendation, recommendation.agentResult?.rankedCandidates ?? null) : ""}<div class="decision-controls"><label class="override-control">Central command override<select id="live-override-select"><option value="">Select another available responder</option>${options}</select></label><button id="live-override-button" class="secondary-button" disabled>Override dispatch</button></div>${staffingControls(state, issue)}</section>`);
    const select = document.querySelector("#live-override-select");
    const override = document.querySelector("#live-override-button");
    select.onchange = () => { override.disabled = !select.value; };
    override.onclick = () => perform("/assignments/override", { recommendationId: recommendation.id, responderId: select.value });
    override.disabled = !select.value;
    bindStaffingControls(state, issue);
    return;
  }
  const recommendation = latestRecommendation(state, issue.id);
  if (!recommendation || recommendation.status === "STALE") {
    setHtml(elements["baseline-panel"], `<p class="workflow-prompt">The automatic matcher will build current evidence and both deterministic baselines.</p>`);
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card pending-state" aria-live="polite"><p class="eyebrow">Automatic dispatch</p><h3>${recommendation ? "Rematch queued" : "Matching queued"}</h3><p>${state.simulationState.status === "RUNNING" ? "Compass will process this issue automatically." : "Resume the simulation to start autonomous matching."}</p>${staffingControls(state, issue)}</section>`);
    bindStaffingControls(state, issue);
    return;
  }
  setHtml(elements["baseline-panel"], `<p class="eyebrow">Deterministic baselines</p><div class="baseline-card"><span>Nearest available</span><strong>→ ${escapeHtml(responderName(state, recommendation.nearestWinner))}</strong></div><div class="baseline-card"><span>Naive score <small>ignores sample strength</small></span><strong>→ ${escapeHtml(responderName(state, recommendation.naiveWinner))}</strong></div>`);
  if (recommendation.decision === "STALE") {
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card pending-state"><h3>Automatic rematch queued</h3><p>The prior match became stale because the operating state changed. Compass will refresh it without operator intervention.</p></section>`);
    return;
  }
  if (recommendation.status === "PENDING_MODEL") {
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card pending-state" aria-live="polite"><p class="eyebrow">Compass</p><h3>Recommendation in progress</h3><p>Compass is weighing the supplied eligible evidence. This normally takes several seconds.</p></section>`);
    return;
  }
  if (["READY", "UNAVAILABLE"].includes(recommendation.status)) {
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card pending-state" aria-live="polite"><p class="eyebrow">Automatic dispatch</p><h3>Preparing responder offer</h3><p>The match is ready and will be offered automatically. No confirmation is required.</p></section>`);
    return;
  }
}

function renderOffline(state) {
  elements["context-eyebrow"].textContent = "Selected issue";
  elements["issue-heading"].textContent = "Dispatch status";
  const issue = state.issues.find((entry) => entry.id === state.activeIssueId);
  selectedIssueId = issue.id;
  renderFloor(state);
  setHtml(elements["issue-list"], `<div class="issue-card selected"><strong>Scenario A · ${escapeHtml(issue.id)}</strong><span>Deterministic API-free fallback</span></div>`);
  setHtml(elements["event-feed"], `<p class="workflow-prompt">Offline Demo uses the fixed Scenario A fixture and makes no model API calls.</p>`);
  setHtml(elements["issue-summary"], `<h3>${escapeHtml(state.equipment.find((entry) => entry.id === issue.equipmentId).name)}</h3><p>Class ${escapeHtml(issue.issueClass)} · ${statusLabel(issue.status)}</p>${recommendedFixMarkup(issue, state)}${fixAuditMarkup({ resolutionHistory: state.resolutionHistory.filter((r) => r.issueId === issue.id) })}`);
  const workflow = state.workflow;
  if (!workflow) {
    setHtml(elements["baseline-panel"], "");
    setHtml(elements["recommendation-panel"], `<button id="offline-raise-button">Raise Scenario A issue</button>`);
    document.querySelector("#offline-raise-button").onclick = () => perform("/issues/ISS-104/raise");
    return;
  }
  if (workflow.resolution) {
    setHtml(elements["baseline-panel"], "");
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card assignment-success"><p class="eyebrow">API-free fixed outcome</p><h3>Issue ${escapeHtml(statusLabel(workflow.resolution.status))}</h3><p>The Offline Demo used the same fixed attempt draw and roster-segment resolution math as Live.</p></section>`);
    return;
  }
  setHtml(elements["baseline-panel"], `<div class="baseline-card">Nearest → ${escapeHtml(workflow.nearestBaseline.displayName)}</div><div class="baseline-card">Naive → ${escapeHtml(workflow.naiveScoreBaseline.displayName)}</div>`);
  if (!workflow.agentOutcome) {
    setHtml(elements["recommendation-panel"], `<section class="recommendation-card pending-state" aria-live="polite"><h3>Matching automatically</h3><p>The API-free Compass fixture is preparing the responder offer.</p></section>`);
    return;
  }
  if (["AUTO_ACCEPTED", "CONFIRMED", "OVERRIDDEN"].includes(workflow.decision?.status)) {
    const supportOffer = workflow.supportOffer?.status === "PENDING" ? `<section class="recommendation-card pending-state"><p class="eyebrow">API-free support dispatch</p><h3>Support offer sent to ${escapeHtml(responderName(state, workflow.supportOffer.responderId))}</h3><p>The scripted responder will answer asynchronously.</p></section>` : "";
    setHtml(elements["recommendation-panel"], `${supportOffer}<section class="recommendation-card assignment-success"><h3>${escapeHtml(responderName(state, workflow.decision.assignedResponderId))} assigned</h3><p>The Offline Demo uses the same two-person roster limit, Primary/Support roles, and asynchronous support offer behavior without API calls.</p>${staffingControls(state, issue)}</section>`);
    bindStaffingControls(state, issue);
    return;
  }
  const result = workflow.agentOutcome.result;
  const offeredResponderId = workflow.offer?.responderId ?? result?.topRecommendation?.responderId ?? workflow.naiveScoreBaseline.responderId;
  const alternatives = workflow.candidatePacket.candidates.filter((candidate) => candidate.responderId !== offeredResponderId && state.responders.find((entry) => entry.id === candidate.responderId)?.availability === "AVAILABLE").map((candidate) => `<option value="${escapeHtml(candidate.responderId)}">${escapeHtml(candidate.displayName)}</option>`).join("");
  setHtml(elements["recommendation-panel"], `<section class="recommendation-card"><p class="eyebrow">API-free automatic dispatch</p><h3>Offer sent to ${escapeHtml(responderName(state, offeredResponderId))}</h3><p>${result?.topRecommendation?.rationale ? escapeHtml(result.topRecommendation.rationale) : "The deterministic fallback supplied this match."}</p><p>The responder will accept asynchronously. Central command may override while the offer is pending.</p>${result ? evidenceTable({ candidateEvidenceSnapshot: workflow.candidatePacket.candidates }, result.rankedCandidates) : ""}<div class="decision-controls"><label class="override-control">Central command override<select id="offline-override-select"><option value="">Select an eligible responder</option>${alternatives}</select></label><button id="offline-override-button" class="secondary-button" disabled>Override dispatch</button></div></section>`);
  const select = document.querySelector("#offline-override-select");
  const override = document.querySelector("#offline-override-button");
  select.onchange = () => { override.disabled = !select.value; };
  override.onclick = () => perform(`/issues/${issue.id}/override/${encodeURIComponent(select.value)}`);
  override.disabled = !select.value;
}

function render(state) {
  const previousMode = currentState?.mode;
  if (previousMode && previousMode !== state.mode) { stationHistoryCache.clear(); selectedIssueId = null; selectedStationId = null; selectedResponderId = null; clearEventSelection(); }
  workspaceNav?.update(state);
  currentState = state; renderStatusBar(state); const live = state.mode === "LIVE"; elements["simulation-controls"].hidden = !live; elements["control-room-search"].hidden = !live; if (!live && searchOpen) closeSearchPalette(); elements["offline-reset-button"].hidden = live; elements["live-mode-button"].classList.toggle("active", live); elements["offline-mode-button"].classList.toggle("active", !live); renderStaffing(state, {escape: escapeHtml, request: roomApi, onState: render}); renderInvestigations(state, {escape: escapeHtml, request: roomApi, onState: render}); askView.render(); if (stationKpisView) stationKpisView.render(state); if (loadboardsView) loadboardsView.render(state); if (obligationsView) obligationsView.render(state); if (handlerEpisodesView) handlerEpisodesView.render(state); if (calibrationsView) calibrationsView.render(state); if (changeoverReadinessView) changeoverReadinessView.render(state); renderResponders(state); renderStations(state); renderSidebarTabs(); if (currentView === "settings" && currentSettingsTab === "demo") renderDemoContinuity(state);
  if (currentView === "settings" && currentSettingsTab === "demo") renderStaffing(state, {escape: escapeHtml, request: roomApi, onState: render});
  if (!live) { renderOffline(state); renderAgentActivity(state); return; }
  elements["simulation-time"].textContent = new Date(state.simulationState.simulationTime).toISOString().replace("T", " ").slice(0, 16); elements["simulation-status"].textContent = statusLabel(state.simulationState.status); renderSpeedOptions(state.simulationState.speedMultiplier); elements["pause-resume-button"].textContent = state.simulationState.status === "RUNNING" ? "Pause" : "Resume";
  renderFloor(state); const issue = chooseIssue(state); renderIssues(state); renderEvents(state); renderLiveDecision(state, issue); renderAgentActivity(state); if (searchOpen) renderSearchPalette();
}

async function api(url, options = {}) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 45_000);
  try { const method = (options.method ?? "GET").toUpperCase(); const response = await fetch(url, { ...options, headers: options.body || ["POST", "PUT", "PATCH", "DELETE"].includes(method) ? { "content-type": "application/json" } : undefined, signal: controller.signal }); if (!response.ok) { const payload = await response.json().catch(() => ({})); const error = new Error(payload.error ?? "Compass request failed"); error.payload = payload; error.status = response.status; throw error; } return response.json(); }
  catch (error) { if (error.name === "AbortError") throw new Error("Compass did not respond within 45 seconds. Check application logs."); throw error; }
  finally { clearTimeout(timeout); }
}
/**
 * Explicit room-scoped vs. deployment-global request helpers, rather than one
 * auto-prefixing api() with an opt-out list for the few global routes. A call
 * site states its own intent (roomApi("/state") vs. globalApi("/settings"))
 * instead of relying on someone remembering an exception — see
 * Control_Rooms_SOW_v1_DRAFT.md §4.6.
 */
function roomApi(path, options = {}) {
  if (!currentControlRoomId) throw new Error("No Control Room is selected");
  return api(`/api/control-rooms/${encodeURIComponent(currentControlRoomId)}${path}`, options);
}
function globalApi(path, options = {}) { return api(`/api${path}`, options); }
/** Bottom status bar: room, simulated clock, run state and speed, plus whether the last poll succeeded. */
function renderStatusBar(state) {
  if (!document.querySelector("#status-bar")) return;
  const live = state.mode === "LIVE", sim = state.simulationState;
  document.querySelector("#status-bar-room").textContent = currentControlRoomId ?? "—";
  document.querySelector("#status-bar-clock").textContent = live && sim ? new Date(sim.simulationTime).toISOString().replace("T", " ").slice(0, 16) : "—";
  document.querySelector("#status-bar-run").textContent = live && sim ? statusLabel(sim.status) : "Offline demo";
  document.querySelector("#status-bar-dot").className = `sim-dot ${live && sim ? String(sim.status).toLowerCase() : "offline"}`;
  document.querySelector("#status-bar-speed").textContent = live && sim ? `${sim.speedMultiplier}×` : "—";
}
let lastSyncOk = null;
function setStatusBarSync(ok) {
  const sync = document.querySelector("#status-bar-sync");
  if (!sync) return;
  sync.classList.toggle("status-bar-sync-failed", !ok);
  sync.textContent = ok ? `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Update failed — retrying";
  const live = document.querySelector("#status-bar-live");
  if (live && ok !== lastSyncOk) {
    const wasFailed = lastSyncOk === false;
    lastSyncOk = ok;
    live.textContent = ok ? (wasFailed ? "Room updates restored" : "Room updates connected") : "Update failed — retrying";
  }
}
function reportClientError(action, error) { fetch("/api/logs/client", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, message: error.message }) }).catch(() => {}); }
/** `path` is room-relative (e.g. "/reset", "/simulation/pause") — every perform() call is a room-scoped mutation. */
async function perform(path, body = null) { if (actionInFlight) return; actionInFlight = true; localAgentActivity = activityForUrl(path); const actionButton = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null; actionButton?.classList.add("is-loading"); document.body.classList.add("busy"); renderAgentActivity(currentState); try { const nextState = await roomApi(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }); if (["/reset", "/simulation/reset"].includes(path)) { stationHistoryCache.clear(); selectedIssueId = null; clearEventSelection(); } render(nextState); } catch (error) { reportClientError(path, error); setHtml(elements["recommendation-panel"], `<p class="load-error">${escapeHtml(error.message)}</p>`); } finally { actionInFlight = false; localAgentActivity = null; actionButton?.classList.remove("is-loading"); document.body.classList.remove("busy"); renderAgentActivity(currentState); } }

elements["pause-resume-button"].addEventListener("click", () => perform(currentState.simulationState.status === "RUNNING" ? "/simulation/pause" : "/simulation/resume"));
elements["speed-select"].addEventListener("change", () => perform("/simulation/speed", { speed: Number(elements["speed-select"].value) })); elements["force-event-button"].addEventListener("click", () => perform("/simulation/force-event")); elements["force-resolve-button"].addEventListener("click", () => { if (!selectedIssueId) return; perform(`/issues/${encodeURIComponent(selectedIssueId)}/force-resolve`); }); elements["reset-button"].addEventListener("click", () => perform("/reset")); elements["live-mode-button"].addEventListener("click", () => perform("/mode", { mode: "LIVE" })); elements["offline-mode-button"].addEventListener("click", () => perform("/mode", { mode: "OFFLINE" })); elements["control-room-tab"].addEventListener("click", () => switchView("control")); elements["analytics-tab"].addEventListener("click", () => switchView("analytics")); elements["settings-tab"].addEventListener("click", () => switchView("settings"));
elements["settings-api-tab"].addEventListener("click", () => switchSettingsTab("api"));
elements["settings-demo-tab"].addEventListener("click", () => switchSettingsTab("demo"));
elements["offline-reset-button"].addEventListener("click", () => perform("/reset"));
elements["open-control-search"].addEventListener("click", openSearchPalette);
elements["rooms-tab"].addEventListener("click", () => switchView("rooms"));
elements["close-control-search"].addEventListener("click", closeSearchPalette);
elements["control-search-input"].addEventListener("input", (event) => { searchQuery = event.target.value; searchActiveIndex = 0; renderSearchPalette(); });
elements["control-search-filters"].addEventListener("click", (event) => { const button = event.target.closest("[data-search-filter]"); if (!button) return; searchFilter = button.dataset.searchFilter; searchActiveIndex = 0; renderSearchPalette(); });
elements["control-search-input"].addEventListener("keydown", (event) => {
  const results = ["ISSUE", "EQUIPMENT", "RESPONDER"].flatMap((type) => buildSearchResults(currentState).filter((result) => (searchFilter === "ALL" || result.type === searchFilter) && result.type === type).slice(0, 5));
  if (event.key === "Escape") { event.preventDefault(); closeSearchPalette(); return; }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); searchActiveIndex = results.length ? (searchActiveIndex + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0; renderSearchPalette(); return; }
  if (event.key === "Enter" && results[searchActiveIndex]) { event.preventDefault(); selectSearchResult(results[searchActiveIndex].type, results[searchActiveIndex].id); }
});
elements["control-search-palette"].addEventListener("keydown", (event) => {
  if (event.key === "Tab") trapFocus(elements["control-search-palette"], event);
});
document.addEventListener("keydown", (event) => {
  const target = event.target;
  const inFormField = target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
  const openLauncher = document.querySelector(".screen-launcher[open]");
  if (openLauncher && event.key === "Escape") {
    event.preventDefault();
    openLauncher.open = false;
    openLauncher.querySelector("summary")?.focus();
    return;
  }
  if (searchOpen && event.key === "Escape") { event.preventDefault(); closeSearchPalette(); return; }
  if (inFormField || event.defaultPrevented || currentView !== "control" || currentState?.mode !== "LIVE") return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearchPalette(); }
  else if (event.key === "/" && !event.altKey && !event.metaKey && !event.ctrlKey) { event.preventDefault(); openSearchPalette(); }
});
function switchSettingsTab(tab) {
  currentSettingsTab = tab;
  const api = tab === "api";
  elements["settings-api-panel"].hidden = !api;
  elements["settings-demo-panel"].hidden = api;
  elements["settings-api-tab"].classList.toggle("active", api);
  elements["settings-demo-tab"].classList.toggle("active", !api);
  elements["settings-api-tab"].setAttribute("aria-selected", String(api));
  elements["settings-demo-tab"].setAttribute("aria-selected", String(!api));
  if (api) loadSettings();
  else { renderAgentActivity(currentState); renderDemoContinuity(currentState); }
}
function switchView(view) { if (view !== "control" && searchOpen) closeSearchPalette(); currentView = view; elements["control-room-view"].hidden = view !== "control"; elements["rooms-view"].hidden = view !== "rooms"; elements["analytics-view"].hidden = view !== "analytics"; elements["settings-view"].hidden = view !== "settings"; elements["control-room-tab"].classList.toggle("active", view === "control"); elements["rooms-tab"].classList.toggle("active", view === "rooms"); elements["analytics-tab"].classList.toggle("active", view === "analytics"); elements["settings-tab"].classList.toggle("active", view === "settings"); if (view === "rooms") loadControlRooms(); if (view === "analytics") { loadAnalytics(); paretoPanel?.show(); } else paretoPanel?.hide(); if (view === "settings") switchSettingsTab(currentSettingsTab); }
async function loadControlRooms() { try { renderControlRooms((await globalApi("/control-rooms")).rooms); } catch (error) { setHtml(elements["rooms-content"], `<p class="load-error">${escapeHtml(error.message)}</p>`); } }
function renderControlRooms(rooms) { const current = rooms.find((room) => room.id === currentControlRoomId); if(current) document.querySelector("#active-room-name").textContent=current.displayName ?? current.label; setHtml(elements["rooms-content"], `<p class="workflow-prompt">Simulation state is shared by everyone viewing each Control Room. Names affect directory display only.</p><div class="room-management-list">${rooms.map((room) => `<article class="room-management-card"><strong>${escapeHtml(room.displayName ?? room.label)}${room.id === currentControlRoomId ? " · Current" : ""}</strong><span>${escapeHtml(room.label)} · ${escapeHtml(room.health)}${room.mode ? ` · ${escapeHtml(statusLabel(room.mode))} · ${escapeHtml(statusLabel(room.simulationStatus))}` : ""}</span>${room.id === currentControlRoomId ? `<form data-room-rename data-revision="${room.revision}"><label>Display name <input name="displayName" value="${escapeHtml(room.displayName ?? room.label)}" maxlength="80" required></label><button type="submit">Rename current room</button><p class="room-rename-feedback" aria-live="polite"></p></form>` : `<button type="button" data-open-room="${escapeHtml(room.id)}">Open</button>`}</article>`).join("")}</div>`); document.querySelectorAll("[data-open-room]").forEach((button) => { button.onclick = () => { window.location.href = `/rooms/${encodeURIComponent(button.dataset.openRoom)}`; }; }); const form = document.querySelector("[data-room-rename]"); if (form && current) form.onsubmit = async (event) => { event.preventDefault(); const input = form.elements.displayName; const feedback = form.querySelector(".room-rename-feedback"); try { const result = await globalApi(`/control-rooms/${encodeURIComponent(current.id)}/display-name`, { method: "PATCH", body: JSON.stringify({ displayName: input.value, expectedRevision: Number(form.dataset.revision) }) }); await loadControlRooms(); const refreshedFeedback = elements["rooms-content"].querySelector(".room-rename-feedback"); if (refreshedFeedback) refreshedFeedback.textContent = `Renamed to ${result.displayName}.`; } catch (error) { const latest = error.payload?.code === "ROOM_METADATA_CONFLICT" ? error.payload.current : null; feedback.textContent = latest ? `Another user saved “${latest.displayName}”. Your text is unchanged.` : error.message; if (latest) { form.dataset.revision = String(latest.revision); const useCurrent = document.createElement("button"); useCurrent.type = "button"; useCurrent.className = "secondary-button"; useCurrent.textContent = "Use current name"; useCurrent.onclick = () => { input.value = latest.displayName; input.focus(); }; feedback.append(" ", useCurrent); } } }; }
async function loadAnalytics() { try { const analytics = await roomApi("/analytics"); if (!analyticsPeriodDetail || analyticsPeriodDetail.level !== analyticsPeriodLevel) analyticsPeriodDetail = analyticsPeriodLevel === "DAY" ? analytics.periodAnalytics : await roomApi(`/analytics/period?level=${encodeURIComponent(analyticsPeriodLevel)}`); renderAnalytics(analytics); } catch { elements["analytics-content"].innerHTML = `<p class="workflow-prompt">Analytics backend is not available yet.</p>`; } }
async function selectAnalyticsPeriod(level) { analyticsPeriodLevel = level; analyticsPeriodDetail = await roomApi(`/analytics/period?level=${encodeURIComponent(level)}`); if (currentView === "analytics") loadAnalytics(); }
function metricValue(metric, formatter = analyticsRate) {
  return metric.status === 'INSUFFICIENT_DATA' ? `<span aria-hidden="true">—</span><small class="metric-explanation">${escapeHtml(formatter(metric))}</small>` : escapeHtml(formatter(metric));
}
function analyticsRate(metric) { const n = formatCount(metric.denominator ?? metric.disagreementDenominator); return metric.status === "INSUFFICIENT_DATA" ? `Insufficient data (n=${n})` : `${Math.round(metric.rate * 100)}% (n=${n})`; }
function periodBars(periods, metric, label, color) {
  const max = Math.max(1, ...periods.map((period) => period[metric]));
  const unit = metric === "downtimeMinutes" ? "minutes" : "issues";
  const labelForPeriod = (period) => analyticsPeriodLevel === "HOUR" ? period.start.slice(11, 16) : period.start.slice(0, 10);
  return `<section class="analytics-chart period-chart"><div><span>${escapeHtml(label)}</span><small>Recorded simulated activity</small></div><div class="period-bars" style="--period-count:${periods.length}" role="list" aria-label="${escapeHtml(label)} by period">${periods.map((period) => { const value = period[metric]; const state = period.status === "INSUFFICIENT_HISTORY" ? "insufficient history" : period.status === "PARTIAL" ? "partial" : "complete"; return `<div role="listitem" class="period-bar ${period.status === "PARTIAL" ? "partial" : ""} ${period.status === "INSUFFICIENT_HISTORY" ? "insufficient" : ""}" title="${escapeHtml(period.start)}"><span style="height:${Math.max(4, value / max * 100)}%;background:${color}"></span><strong>${metric === "downtimeMinutes" ? formatMinutes(value) : value}</strong><small><time datetime="${escapeHtml(period.start)}">${escapeHtml(labelForPeriod(period))}</time> · ${state}</small></div>`; }).join("")}</div><small>${escapeHtml(unit)} per period</small></section>`;
}
function periodAnalyticsPanel(analytics) {
  const period = analyticsPeriodDetail?.level === analyticsPeriodLevel ? analyticsPeriodDetail : analytics.periodAnalytics;
  const levels = ["HOUR", "DAY", "WEEK", "MONTH"];
  const labels = { HOUR: "past 12 hours", DAY: "past 7 days", WEEK: "past 4 weeks", MONTH: "past 3 months" };
  return `<section class="analytics-panel dashboard-trends"><div class="panel-title"><div><p class="eyebrow">Recorded simulated activity</p><h3>Issue lifecycle and equipment downtime</h3><p class="workflow-prompt">${escapeHtml(period?.periodDefinition ?? "")} These are observed simulated records, not a forecast or a measure of issue priority.</p></div><span class="analytics-window">${labels[analyticsPeriodLevel] ?? "selected period"} · complete and partial periods labelled</span></div><div class="analytics-period-tabs" role="tablist" aria-label="Analytics period">${levels.map((level) => `<button type="button" data-analytics-level="${level}" role="tab" aria-selected="${analyticsPeriodLevel === level}">${statusLabel(level)}</button>`).join("")}</div><div class="chart-grid">${periodBars(period?.periods ?? [], "raised", "Issues raised", "var(--ink)")}${periodBars(period?.periods ?? [], "resolved", "Issues resolved", "var(--ink)")}${periodBars(period?.periods ?? [], "downtimeMinutes", "Aggregate downtime", "var(--accent)")}</div>${fixPeriodTable(period)}</section>`;
}
function analyticsDrill(analytics) {
  if (!analyticsDrilldown) return "";
  const { type, value } = analyticsDrilldown;
  let title = "Operational detail";
  let body = "";
  if (type === "timeline") {
    const measure = value ?? "raised";
    const measureLabel = { raised: "issues raised", resolved: "issues resolved", downtimeMinutes: "aggregate equipment downtime" }[measure] ?? "recorded activity";
    const rows = analytics.operationalTimeline.bins.filter((bin) => bin[measure] > 0);
    title = `${measureLabel} — recorded simulated activity`;
    body = `<p class="workflow-prompt">These are persisted operational records in the selected simulated-time range, not a forecast or a measure of issue priority.${measure === "downtimeMinutes" ? " Each value is the observed equipment-downtime minutes that overlap that bucket." : " Each value is the number of matching lifecycle events recorded in that bucket."}</p><div class="evidence-scroll"><table class="analytics-table"><thead><tr><th>Simulated-time bucket</th><th>${escapeHtml(measureLabel)}</th></tr></thead><tbody>${rows.map((bin) => `<tr><td>${escapeHtml(bin.start.replace("T", " ").slice(0, 16))}–${escapeHtml(bin.end.slice(11, 16))}</td><td>${measure === "downtimeMinutes" ? formatMinutes(bin[measure]) : bin[measure]}</td></tr>`).join("") || `<tr><td colspan="2">No ${escapeHtml(measureLabel)} records in this range.</td></tr>`}</tbody></table></div>`;
  } else if (type === "class") {
    title = `Issue class ${value} — observed volume`;
    body = `<p class="workflow-prompt">${analytics.issues.byClass[value] ?? 0} issues have been observed for this class. Experience below is context only and is not an employee ranking.</p>`;
  } else if (type === "compass") {
    title = "Compass vs. baselines — recommendation records";
    body = `<div class="evidence-scroll"><table class="analytics-table"><thead><tr><th>Issue</th><th>Nearest</th><th>Naive</th><th>Evidence-driven</th></tr></thead><tbody>${analytics.compassRecords.map((record) => `<tr><td>${escapeHtml(record.issueId ?? "—")}</td><td>${record.nearestAgreement ? "Agreed" : "Different"}</td><td>${record.naiveAgreement ? "Agreed" : "Different"}</td><td>${record.evidenceStrengthDriven ? "Yes" : "No"}</td></tr>`).join("") || `<tr><td colspan="4">No completed Compass recommendation records yet.</td></tr>`}</tbody></table></div>`;
  }
  return `<section id="analytics-drill" class="analytics-panel analytics-drill" tabindex="-1" aria-live="polite"><div class="panel-title"><div><p class="eyebrow">Drill-down</p><h3>${escapeHtml(title)}</h3></div><button type="button" class="secondary-button" data-analytics-close>Close</button></div>${body}</section>`;
}
function equipmentDirectory(analytics) {
  const normalizedQuery = analyticsEquipmentQuery.trim().toLowerCase();
  const all = [...analytics.equipment].sort((left, right) => left.equipmentId.localeCompare(right.equipmentId, undefined, { numeric: true }));
  const attention = (item) => item.currentStatus !== "NORMAL" || item.currentOngoingDowntimeMinutes !== null;
  const filtered = all.filter((item) => (analyticsEquipmentFilter === "ALL" || attention(item)) && (!normalizedQuery || `${item.equipmentId} ${item.displayName}`.toLowerCase().includes(normalizedQuery)));
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  analyticsEquipmentPage = Math.min(analyticsEquipmentPage, pageCount - 1);
  const pageItems = filtered.slice(analyticsEquipmentPage * pageSize, (analyticsEquipmentPage + 1) * pageSize);
  const selected = analyticsDrilldown?.type === "equipment" ? all.find((item) => item.equipmentId === analyticsDrilldown.value) : null;
  const selectedPanel = selected ? `<section class="equipment-fact-panel" aria-live="polite"><div class="panel-title"><div><p class="eyebrow">Selected equipment</p><h3>${escapeHtml(selected.displayName)}</h3></div><button type="button" class="secondary-button" data-analytics-equipment-close>Clear selection</button></div><dl class="drill-facts"><div><dt>Current status</dt><dd>${statusLabel(selected.currentStatus)}</dd></div><div><dt>Issues observed</dt><dd>${selected.issueCount}</dd></div><div><dt>Uptime</dt><dd>${Math.round(selected.uptimePercent * 100)}% across ${Math.round(selected.uptimeDenominatorMinutes)} min</dd></div><div><dt>Open downtime</dt><dd>${selected.currentOngoingDowntimeMinutes === null ? "None" : formatMinutes(selected.currentOngoingDowntimeMinutes)}</dd></div></dl></section>` : "";
  return `<section class="analytics-panel equipment-directory" aria-label="Equipment directory"><div class="panel-title"><div><p class="eyebrow">Equipment directory</p><h3>Find equipment without scanning the whole estate</h3></div><span class="analytics-window">${filtered.length} matching · stable ID order</span></div><div class="directory-controls"><div class="directory-filter" role="group" aria-label="Equipment directory filter"><button type="button" data-equipment-filter="ATTENTION" class="${analyticsEquipmentFilter === "ATTENTION" ? "active" : ""}">Needs attention</button><button type="button" data-equipment-filter="ALL" class="${analyticsEquipmentFilter === "ALL" ? "active" : ""}">All equipment</button></div><label class="directory-search">Search equipment <input id="analytics-equipment-search" type="search" value="${escapeHtml(analyticsEquipmentQuery)}" placeholder="Name or asset ID" autocomplete="off"></label></div>${selectedPanel}<div class="equipment-directory-list">${pageItems.map((item) => `<button type="button" class="equipment-directory-row ${selected?.equipmentId === item.equipmentId ? "selected" : ""}" data-analytics-equipment="${escapeHtml(item.equipmentId)}"><strong>${escapeHtml(item.displayName)}</strong><span>${escapeHtml(item.equipmentId)} · ${statusLabel(item.currentStatus)}</span><span>${item.currentOngoingDowntimeMinutes === null ? `${item.issueCount} observed issues` : `${formatMinutes(item.currentOngoingDowntimeMinutes)} open downtime`}</span></button>`).join("") || `<p class="workflow-prompt">No equipment matches this search.</p>`}</div><nav class="directory-pagination" aria-label="Equipment pages"><button type="button" class="secondary-button" data-equipment-page="previous" ${analyticsEquipmentPage === 0 ? "disabled" : ""}>Previous</button><span>Page ${analyticsEquipmentPage + 1} of ${pageCount}</span><button type="button" class="secondary-button" data-equipment-page="next" ${analyticsEquipmentPage >= pageCount - 1 ? "disabled" : ""}>Next</button></nav></section>`;
}
function staffingPeriodTable() {
  const period = analyticsPeriodDetail;
  if (!period?.periods?.some((p)=>p.staffingRecommendations)) return '';
  const kinds = ['APPROVED_TOP','APPROVED_ALTERNATIVE','REJECTED','EXPIRED','AUTO_APPROVED'];
  return `<details data-analytics-detail="staffing-period"><summary>Staffing decisions by ${escapeHtml(period.level.toLowerCase())}</summary><div class="evidence-scroll"><table class="analytics-table"><thead><tr><th>Period / coverage</th><th>Terminal decisions</th><th>Approved top</th><th>Approved alternative</th><th>Rejected</th><th>Expired</th><th>Auto-approved by policy</th><th>Baseline agreement</th><th>Unmet-risk events</th></tr></thead><tbody>${period.periods.map((p)=>{const m=p.staffingRecommendations;return `<tr><td>${escapeHtml(p.start.slice(0,16).replace('T',' '))} · ${escapeHtml(statusLabel(p.status))}</td><td>${m.totalDecisions}</td>${kinds.map((k)=>`<td>${m.outcomes[k].numerator} / ${m.outcomes[k].denominator}</td>`).join('')}<td>${analyticsRate(m.baselineAgreement)}</td><td>${m.unmetRiskCount}</td></tr>`;}).join('')}</tbody></table></div></details>`;
}
function renderAnalytics(analytics) {
  if (analytics.mode !== "LIVE") { elements["analytics-content"].innerHTML = `<p class="workflow-prompt">Analytics are available for the persistent Live Simulation.</p>`; return; }
  const responderRows = analytics.responders.map((item) => `<tr><td><strong>${escapeHtml(item.displayName)}</strong></td><td>${statusLabel(item.currentStatus)}</td><td>${item.issuesAttended}</td><td>${analyticsRate(item.successRate)}</td><td>${formatMinutes(item.medianResolutionMinutes)}</td><td>${analyticsRate(item.reopenRate)}</td></tr>`).join("");
  const experienceRows = analytics.issueClassExperience.map((item) => `<tr><td><strong>${escapeHtml(item.displayName)}</strong></td>${["A", "B", "C"].map((issueClass) => `<td><strong>${item.classes[issueClass].cases} cases</strong><span>${formatMinutes(item.classes[issueClass].medianResolutionMinutes)}</span></td>`).join("")}</tr>`).join("");
  const compass = analytics.compassVsBaselines;
  const expanded = [...elements['analytics-content'].querySelectorAll('details[data-analytics-detail]')].filter((d)=>d.open).map((d)=>d.dataset.analyticsDetail);
  const scrollTop = elements['analytics-view'].scrollTop;
  const active = elements['analytics-content'].contains(document.activeElement) ? document.activeElement : null;
  const activeId = active?.id;
  const selection = active?.matches('input[type="search"]') ? [active.selectionStart, active.selectionEnd] : null;
  const changed = setHtml(elements["analytics-content"], `<p class="analytics-snapshot">Snapshot at ${escapeHtml(new Date(analytics.snapshotSimulationTime).toISOString().replace("T", " ").slice(0, 16))} · Chart periods use recorded simulated activity; they are not a forecast or a measure of issue priority.</p>
    <div id="analytics-overview" class="kpi-grid dashboard-kpis"><button type="button" data-analytics-class="ALL"><span>Active issues</span><strong>${analytics.issues.active}</strong><small>${analytics.issues.total} observed</small></button><button type="button" data-analytics-class="ALL"><span>Open downtime</span><strong>${formatMinutes(analytics.equipment.reduce((sum, item) => sum + (item.currentOngoingDowntimeMinutes ?? 0), 0))}</strong><small>current snapshot</small></button><button type="button" data-analytics-class="ALL"><span>Reopen rate</span><strong>${metricValue(analytics.issues.reopenRate)}</strong><small>observed attempts</small></button><button type="button" data-analytics-drill="compass"><span>Compass recommendations</span><strong>${compass.totalRecommendations}</strong><small>completed comparisons</small></button></div>
    <div id="analytics-pareto-slot"></div>${periodAnalyticsPanel(analytics)}${fixAnalyticsPanel(analytics)}
    <section id="analytics-staffing" class="analytics-panel"><p class="eyebrow">Lifetime decisions · period details below</p><h3>Staffing recommendations</h3><p>${analytics.workforce.recommendations.totalDecisions} terminal recommendations · ${analytics.workforce.recommendations.unmetRiskCount} unmet-risk events</p><p class="workflow-prompt">Includes deterministic fallback rankings. Agreement is a comparison of choices, not a causal outcome measure.</p>${staffingPeriodTable()}<div class="metric-grid">${Object.entries(analytics.workforce.recommendations.outcomes).map(([key,value])=>`<div><span>${key==='AUTO_APPROVED'?'Auto-approved by policy':statusLabel(key)}</span><strong>${metricValue(value)}</strong><small>${value.numerator} / ${value.denominator} decisions</small></div>`).join('')}<div><span>Compass vs baseline agreement</span><strong>${metricValue(analytics.workforce.recommendations.baselineAgreement)}</strong></div></div></section>
    ${investigationAnalyticsMarkup(analytics.investigations, { escape: escapeHtml, metricValue })}
    <section class="analytics-panel"><div class="panel-title"><div><p class="eyebrow">Decision evidence</p><h3>Compass vs Baselines</h3></div><button type="button" class="secondary-button" data-analytics-drill="compass">Inspect records</button></div><div class="metric-grid"><button type="button" data-analytics-drill="compass"><span>Agreement with nearest</span><strong>${metricValue(compass.agreementWithNearest)}</strong></button><button type="button" data-analytics-drill="compass"><span>Disagreement with naive</span><strong>${metricValue(compass.disagreementWithNaive)}</strong></button><button type="button" data-analytics-drill="compass"><span>Disagreed with both</span><strong>${metricValue(compass.disagreementWithBoth)}</strong></button><button type="button" data-analytics-drill="compass"><span>Evidence-strength driven</span><strong>${metricValue(compass.evidenceStrengthDrivenDisagreements)}</strong></button></div></section>
    <section class="analytics-panel"><div class="panel-title"><div><p class="eyebrow">Issue mix</p><h3>Observed issue classes</h3></div></div><div class="metric-grid issue-class-metrics">${["A", "B", "C"].map((issueClass) => `<button type="button" data-analytics-class="${issueClass}"><span>Class ${issueClass}</span><strong>${analytics.issues.byClass[issueClass]}</strong><small>Click for context</small></button>`).join("")}</div></section>
    ${analyticsDrilldown?.type !== "timeline" && analyticsDrilldown?.type !== "equipment" ? analyticsDrill(analytics) : ""}
    ${equipmentDirectory(analytics)}
    <section id="analytics-experience" class="analytics-panel analytics-detail-panel"><details data-analytics-detail="responders"><summary><h3>Responder issue-response summary</h3><span>View observed records</span></summary><div class="evidence-scroll"><table class="analytics-table"><thead><tr><th>Responder</th><th>Status</th><th>Cases</th><th>Success</th><th>Median</th><th>Reopen</th></tr></thead><tbody>${responderRows}</tbody></table></div></details></section>
    <section class="analytics-panel analytics-detail-panel"><details data-analytics-detail="experience"><summary><h3>Issue-Class Experience</h3><span>Experience context only — not an employee ranking.</span></summary><div class="evidence-scroll"><table class="analytics-table experience-matrix"><thead><tr><th>Responder</th><th>Class A</th><th>Class B</th><th>Class C</th></tr></thead><tbody>${experienceRows}</tbody></table></div></details></section>`);
  if (!changed) return;
  const slot = document.querySelector('#analytics-pareto-slot');
  if (slot && paretoRoot && displayScreen !== 'pareto') slot.append(paretoRoot);
  elements['analytics-content'].querySelectorAll('details[data-analytics-detail]').forEach((d)=>d.open=expanded.includes(d.dataset.analyticsDetail));
  if (activeId) { const next=document.getElementById(activeId); next?.focus({preventScroll:true}); if(selection && next) next.setSelectionRange(...selection); }
  elements['analytics-view'].scrollTop=scrollTop;
  elements["analytics-content"].querySelectorAll("[data-analytics-drill]").forEach((button) => { button.onclick = () => { analyticsReturnFocus = `[data-analytics-drill="${button.dataset.analyticsDrill}"]${button.dataset.analyticsMeasure ? `[data-analytics-measure="${button.dataset.analyticsMeasure}"]` : ""}`; analyticsDrilldown = { type: button.dataset.analyticsDrill, value: button.dataset.analyticsMeasure }; renderAnalytics(analytics); focusAnalyticsDrill(); }; });
  elements["analytics-content"].querySelectorAll("[data-analytics-level]").forEach((button) => { button.onclick = () => { analyticsPeriodDetail = null; selectAnalyticsPeriod(button.dataset.analyticsLevel).catch(() => {}); }; });
  elements["analytics-content"].querySelectorAll("[data-analytics-equipment]").forEach((button) => { button.onclick = () => { analyticsDrilldown = { type: "equipment", value: button.dataset.analyticsEquipment }; renderAnalytics(analytics); document.querySelector(".equipment-fact-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }; });
  elements["analytics-content"].querySelectorAll("[data-analytics-class]").forEach((button) => { button.onclick = () => { analyticsDrilldown = { type: "class", value: button.dataset.analyticsClass }; renderAnalytics(analytics); }; });
  elements["analytics-content"].querySelector("[data-analytics-close]")?.addEventListener("click", () => { const returnFocus = analyticsReturnFocus; analyticsDrilldown = null; renderAnalytics(analytics); document.querySelector(returnFocus)?.focus(); });
  const drillPanel = elements["analytics-content"].querySelector("#analytics-drill");
  if (drillPanel) {
    drillPanel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        const returnFocus = analyticsReturnFocus;
        analyticsDrilldown = null;
        renderAnalytics(analytics);
        document.querySelector(returnFocus)?.focus();
      } else if (e.key === "Tab") {
        trapFocus(drillPanel, e);
      }
    });
  }
  elements["analytics-content"].querySelector("[data-analytics-equipment-close]")?.addEventListener("click", () => { analyticsDrilldown = null; renderAnalytics(analytics); });
  elements["analytics-content"].querySelectorAll("[data-equipment-filter]").forEach((button) => { button.onclick = () => { analyticsEquipmentFilter = button.dataset.equipmentFilter; analyticsEquipmentPage = 0; renderAnalytics(analytics); }; });
  elements["analytics-content"].querySelector("#analytics-equipment-search")?.addEventListener("input", (event) => { analyticsEquipmentQuery = event.target.value; analyticsEquipmentPage = 0; renderAnalytics(analytics); document.querySelector("#analytics-equipment-search")?.focus(); });
  elements["analytics-content"].querySelectorAll("[data-equipment-page]").forEach((button) => { button.onclick = () => { analyticsEquipmentPage += button.dataset.equipmentPage === "next" ? 1 : -1; renderAnalytics(analytics); }; });
}
function focusAnalyticsDrill() { requestAnimationFrame(() => { const drill = document.querySelector("#analytics-drill"); drill?.scrollIntoView({ behavior: "smooth", block: "nearest" }); drill?.focus({ preventScroll: true }); }); }
// Model lists are per-provider: switching the provider dropdown must not lose
// a list already fetched for the other provider this session, and must not
// show one provider's models as if they belonged to the other.
let discoveredModelsByProvider = {};
// The dropdown's current choice, which may differ from the persisted active
// provider until Save is clicked — the operator can browse a provider's
// models before committing to it.
let selectedProviderId = null;
let modelDrafts = {};
const SETTINGS_ROLES = [
  { role: "compass", label: "Ranking (Compass)", modelId: "settings-model", effortId: "settings-effort", saveId: "settings-save" },
  { role: "event-planner", label: "Event planner", modelId: "settings-event-planner-model", effortId: "settings-event-planner-effort", saveId: "settings-event-planner-save" },
  { role: "investigator", label: "Investigator", modelId: "settings-investigator-model", effortId: "settings-investigator-effort", saveId: "settings-investigator-save" },
  { role: "assistant", label: "Assistant (Ask Compass)", modelId: "settings-assistant-model", effortId: "settings-assistant-effort", saveId: "settings-assistant-save" },
  { role: "narrator", label: "Narrator", modelId: "settings-narrator-model", effortId: "settings-narrator-effort", saveId: "settings-narrator-save" },
];
// A live AMD ranking took about 40–90s of real time (Nebius about 1–4s), so above 5× it arrives long after
// the simulated dispatch moved on (docs/decisions.md). The API still accepts 10× and 60×
// for offline generation; a room already running faster shows its speed until lowered.
const RECOMMENDED_SPEEDS = [1, 5];
function renderSpeedOptions(speed) {
  const select = elements["speed-select"];
  const speeds = RECOMMENDED_SPEEDS.includes(speed) ? RECOMMENDED_SPEEDS : [...RECOMMENDED_SPEEDS, speed];
  if (select.dataset.speeds !== speeds.join(",")) {
    select.innerHTML = speeds.map((value) => RECOMMENDED_SPEEDS.includes(value)
      ? `<option value="${value}">${value}×</option>`
      : `<option value="${value}" disabled>${value}× (above recommended)</option>`).join("");
    select.dataset.speeds = speeds.join(",");
  }
  select.value = String(speed);
}
function reasoningEffortsFor(providerId, modelId) { return (discoveredModelsByProvider[providerId] ?? []).find((model) => model.id === modelId)?.reasoningEfforts ?? null; }

let latestSettingsUsage = null;
function renderUsage(usage) {
  if (!usage?.today) return '<section class="settings-connection settings-usage" aria-label="Usage"><h3>Usage</h3><p class="workflow-prompt">Usage is unavailable.</p></section>';
  const money = (value) => `$${Number(value ?? 0).toFixed(4)}`;
  const today = usage.today;
  const rows = SETTINGS_ROLES.map(({role,label}) => {
    const row = today.byRole?.find((item) => item.role === role);
    return `<tr><td>${label}</td><td>${row?.calls ?? 0}</td><td>${row?.promptTokens ?? 0}</td><td>${row?.completionTokens ?? 0}</td></tr>`;
  }).join('');
  return `<section class="settings-connection settings-usage" aria-label="Usage"><h3>Usage</h3>
    <p class="workflow-prompt">${escapeHtml(today.day)} UTC · ${today.unpricedCalls ? 'Known estimated spend' : 'Estimated spend'} ${money(today.knownCostUsd)} · ${today.calls} calls</p>
    <p class="workflow-prompt">Daily budget: ${usage.budgetUsd > 0 ? money(usage.budgetUsd) : 'Unlimited'} · ${usage.exhausted ? 'Budget exhausted — deterministic fallback' : usage.budgetUsd > 0 ? 'Within daily budget' : 'No daily budget limit'}</p>
    ${today.unpricedCalls ? `<p class="workflow-prompt">${today.unpricedCalls} unpriced calls; the cost estimate is incomplete.</p>` : ''}
    <div class="evidence-scroll"><table class="analytics-table"><thead><tr><th>Role</th><th>Calls</th><th>Input tokens</th><th>Output tokens</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}
function renderSettings(settings) {
  latestSettingsUsage = settings.usage ?? latestSettingsUsage;
  if (Array.isArray(settings.models) && settings.models.length) discoveredModelsByProvider[settings.provider] = settings.models;
  if (!selectedProviderId || !(settings.providers ?? []).some((provider) => provider.id === selectedProviderId)) selectedProviderId = settings.provider;
  const offline = currentState && currentState.mode !== "LIVE";
  const providerMeta = (settings.providers ?? []).find((provider) => provider.id === selectedProviderId);
  const providerOptions = (settings.providers ?? []).map((provider) => `<option value="${escapeHtml(provider.id)}" ${provider.id === selectedProviderId ? "selected" : ""} ${provider.enabled ? "" : "disabled"}>${escapeHtml(provider.label)}${provider.enabled ? "" : " (coming soon)"}</option>`).join("");
  const rolePickers = SETTINGS_ROLES.map(({ role, label, modelId, effortId, saveId }) => {
    const saved = settings.modelsByProvider?.[selectedProviderId]?.[role] ?? settings.roles?.[role] ?? settings;
    const draft = modelDrafts[role] ??= { modelId: saved.modelId, reasoningEffort: saved.reasoningEffort, timeoutMs: saved.timeoutMs ?? 30000 };
    const models = discoveredModelsByProvider[selectedProviderId] ?? [];
    const choices = [...models];
    if (!choices.some((model) => model.id === draft.modelId)) choices.unshift({ id: draft.modelId });
    const modelOptions = choices.map((model) => `<option value="${escapeHtml(model.id)}" ${model.id === draft.modelId ? "selected" : ""}>${escapeHtml(model.id || "Model not configured")}</option>`).join("");
    const efforts = reasoningEffortsFor(selectedProviderId, draft.modelId) ?? [draft.reasoningEffort || "default"];
    const effortOptions = efforts.map((effort) => `<option value="${escapeHtml(effort)}" ${effort === draft.reasoningEffort ? "selected" : ""}>${escapeHtml(effort)}</option>`).join("");
    const validation = saved.modelValidation ?? settings.modelValidation;
    const changed = draft.modelId !== saved.modelId || draft.reasoningEffort !== saved.reasoningEffort || draft.timeoutMs !== (saved.timeoutMs ?? 30000);
    const status = changed ? "Unsaved selection."
      : validation?.status === "MISSING" ? (validation.effectiveModelId ? `Saved model unavailable. Live requests use ${validation.effectiveModelId}.` : "Saved model unavailable. Live requests use deterministic fallback.")
      : validation?.status === "VALID" ? "Saved model is available."
      : validation?.status === "CHECKING" ? "Checking saved model availability…"
      : "Model availability is unverified. Refresh available models to check.";
    return `<fieldset class="settings-role" data-model-role="${role}"><legend>${label}</legend>
      <div class="settings-field"><label for="${modelId}">Model</label><select id="${modelId}">${modelOptions}</select></div>
      <div class="settings-field"><label for="${effortId}">Thinking level</label><select id="${effortId}">${effortOptions}</select></div>
      <div class="settings-field"><label for="${modelId}-timeout">Timeout (milliseconds)</label><input id="${modelId}-timeout" type="number" min="1000" max="120000" step="1000" value="${draft.timeoutMs ?? saved.timeoutMs ?? 30000}" data-saved-timeout="${saved.timeoutMs ?? 30000}"></div>
      <p class="workflow-prompt" data-model-status role="status">${escapeHtml(status)}</p>
      <button id="${saveId}" type="button">Save ${label}</button>
    </fieldset>`;
  }).join("");

  const credentialStatus = providerMeta?.credentialConfigured
    ? `${escapeHtml(providerMeta.label)} API key is configured for this shared deployment (${escapeHtml(providerMeta.credentialHint ?? "masked")}). It is never sent back to the browser.`
    : `No ${escapeHtml(providerMeta?.label ?? "provider")} API key is configured. Live model calls will fail closed to deterministic baselines until a key is added.`;
  const credentialSource = providerMeta?.credentialSource === "environment"
    ? `<p class="workflow-prompt">This key comes from the server environment. Removing a Settings key will return to that server-managed key.</p>`
    : "";
  elements["settings-content"].innerHTML = `<section class="settings-card"><section class="settings-connection"><div class="panel-title"><div><p class="eyebrow">Deployment-wide connection</p><h3>Provider & credentials</h3></div><span class="status-badge">${providerMeta?.credentialConfigured ? "Key configured" : "No key configured"}</span></div>
    <p class="workflow-prompt">${credentialStatus}</p>
    <p class="workflow-prompt">API keys apply to every control room in this deployment. Use this only when you are authorized to manage the shared provider account.</p>
    <label class="settings-field">${providerMeta?.credentialConfigured ? "Replace API key" : "API key"}<input id="settings-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste a new key" /></label>
    <div class="settings-actions"><button id="settings-save-key" type="button">${providerMeta?.credentialConfigured ? "Replace key" : "Save key"}</button>${providerMeta?.credentialSource === "settings" ? `<button id="settings-remove-key" type="button" class="secondary-button">Remove saved key</button>` : ""}</div>
    ${credentialSource}
    <label class="settings-field">Provider<select id="settings-provider">${providerOptions}</select></label>
    <button id="settings-refresh-models" type="button" class="secondary-button" ${offline ? "disabled" : ""}>${offline ? "Switch to Live Simulation to discover models" : "Refresh available models"}</button>
    </section>${renderUsage(latestSettingsUsage)}<div class="settings-role-grid">${rolePickers}</div>
    <p id="settings-feedback" class="workflow-prompt" aria-live="polite"></p>
  </section>`;
  // The server refuses settings changes from tunnel visitors; show that instead of
  // letting them fill in a form that would fail.
  elements["settings-content"].classList.toggle("settings-locked", settings.editable === false);
  if (settings.editable === false) {
    elements["settings-content"].querySelector(".settings-card").insertAdjacentHTML("afterbegin", `<p class="settings-read-only" role="note">Read-only on the public demo. Provider settings can only be changed by the operator.</p>`);
    for (const control of elements["settings-content"].querySelectorAll("input, select, button")) control.disabled = true;
    return;
  }

  document.querySelector("#settings-provider").addEventListener("change", (event) => {
    selectedProviderId = event.target.value;
    modelDrafts = {};
    document.querySelector("#settings-feedback").textContent = "";
    renderSettings(settings);
  });
  document.querySelector("#settings-refresh-models")?.addEventListener("click", refreshModels);
  document.querySelector("#settings-save-key")?.addEventListener("click", saveProviderCredential);
  document.querySelector("#settings-remove-key")?.addEventListener("click", removeProviderCredential);
  for (const picker of SETTINGS_ROLES) {
    const model = document.getElementById(picker.modelId);
    const effort = document.getElementById(picker.effortId);
    const markChanged = () => {
      modelDrafts[picker.role] = { modelId: model.value, reasoningEffort: effort.value, timeoutMs: Number(document.getElementById(`${picker.modelId}-timeout`).value) };
      model.closest("fieldset").querySelector("[data-model-status]").textContent = "Unsaved selection.";
    };
    model.addEventListener("change", () => {
      const nextEfforts = reasoningEffortsFor(selectedProviderId, model.value) ?? ["default"];
      const previous = effort.value;
      effort.innerHTML = nextEfforts.map((value) => `<option value="${escapeHtml(value)}" ${value === previous ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
      markChanged();
    });
    effort.addEventListener("change", markChanged);
    document.getElementById(`${picker.modelId}-timeout`).addEventListener("input", markChanged);
    document.getElementById(picker.saveId).addEventListener("click", () => saveSettings(picker.role));
  }
}

async function loadSettings() {
  modelDrafts = {};
  elements["settings-content"].innerHTML = `<p class="workflow-prompt">Settings are loading…</p>`;
  try {
    const settings = await globalApi("/settings");
    selectedProviderId = settings.provider;
    renderSettings(settings);
  } catch (error) { elements["settings-content"].innerHTML = `<p class="load-error">${escapeHtml(error.message)}</p>`; }
}

async function refreshModels() {
  const button = document.querySelector("#settings-refresh-models");
  const providerId = document.querySelector("#settings-provider")?.value ?? selectedProviderId;
  button.disabled = true; button.classList.add("is-loading");
  try {
    const result = await globalApi(`/settings/models?provider=${encodeURIComponent(providerId)}`);
    discoveredModelsByProvider[providerId] = result.models ?? [];
    selectedProviderId = providerId;
    renderSettings(result);
    const feedback = document.querySelector("#settings-feedback");
    feedback.textContent = result.modelDiscovery?.status === "READY" ? `Found ${(result.models ?? []).length} selectable models.` : (result.modelDiscovery?.reason ?? "Model discovery is unavailable.");
  } catch (error) {
    const feedback = document.querySelector("#settings-feedback");
    if (feedback) feedback.textContent = error.message;
  } finally {
    document.querySelector("#settings-refresh-models")?.classList.remove("is-loading");
    if (document.querySelector("#settings-refresh-models")) document.querySelector("#settings-refresh-models").disabled = currentState && currentState.mode !== "LIVE";
  }
}

async function saveSettings(role) {
  const picker = SETTINGS_ROLES.find((entry) => entry.role === role);
  const button = document.getElementById(picker.saveId);
  const feedback = document.querySelector("#settings-feedback");
  const provider = document.querySelector("#settings-provider").value;
  const modelId = document.getElementById(picker.modelId).value;
  const reasoningEffort = document.getElementById(picker.effortId).value;
  const timeoutInput = document.getElementById(`${picker.modelId}-timeout`);
  const timeoutMs = Number(timeoutInput.value);
  const timeoutChanged = timeoutInput.value !== timeoutInput.dataset.savedTimeout;
  for (const entry of SETTINGS_ROLES) document.getElementById(entry.saveId).disabled = true;
  button.classList.add("is-loading"); feedback.textContent = "";
  try {
    const saved = await globalApi("/settings", { method: "POST", body: JSON.stringify({ provider, role, modelId, reasoningEffort, ...(timeoutChanged ? { timeoutMs } : {}) }) });
    selectedProviderId = saved.provider;
    delete modelDrafts[role];
    renderSettings(saved);
    document.querySelector("#settings-feedback").textContent = `Saved ${picker.label}. Live requests for this role will use this configuration.`;
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    for (const entry of SETTINGS_ROLES) {
      const save = document.getElementById(entry.saveId);
      if (save) { save.disabled = false; save.classList.remove("is-loading"); }
    }
  }
}

async function saveProviderCredential() {
  const button = document.querySelector("#settings-save-key");
  const feedback = document.querySelector("#settings-feedback");
  const provider = document.querySelector("#settings-provider").value;
  const apiKey = document.querySelector("#settings-api-key").value;
  button.disabled = true; button.classList.add("is-loading"); feedback.textContent = "";
  try {
    const saved = await globalApi("/settings/credentials", { method: "POST", body: JSON.stringify({ provider, apiKey }) });
    selectedProviderId = provider;
    renderSettings(saved);
    document.querySelector("#settings-feedback").textContent = "API key saved. It remains write-only.";
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    button.disabled = false; button.classList.remove("is-loading");
  }
}

async function removeProviderCredential() {
  const button = document.querySelector("#settings-remove-key");
  const feedback = document.querySelector("#settings-feedback");
  const provider = document.querySelector("#settings-provider").value;
  button.disabled = true; button.classList.add("is-loading"); feedback.textContent = "";
  try {
    const saved = await globalApi(`/settings/credentials?provider=${encodeURIComponent(provider)}`, { method: "DELETE" });
    selectedProviderId = provider;
    renderSettings(saved);
    document.querySelector("#settings-feedback").textContent = "Saved API key removed.";
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    button.disabled = false; button.classList.remove("is-loading");
  }
}

elements.floor.addEventListener("pointerdown", (event) => {
  // A map is also the background beneath the operator's normal reading path.
  // Require an intentional desktop-only gesture; touch remains native page scroll.
  if (!mapSpacePressed || event.pointerType !== "mouse" || event.button !== 0 || event.target.closest("button")) return;
  event.preventDefault();
  mapDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: mapPanX, panY: mapPanY };
  elements.floor.setPointerCapture(event.pointerId);
  applyCamera();
});
elements.floor.addEventListener("pointermove", (event) => {
  if (!mapDrag || event.pointerId !== mapDrag.pointerId) return;
  const bounds = elements.floor.getBoundingClientRect();
  mapPanX = clamp(mapDrag.panX + event.clientX - mapDrag.x, -bounds.width, bounds.width);
  mapPanY = clamp(mapDrag.panY + event.clientY - mapDrag.y, -bounds.height, bounds.height);
  applyCamera();
});
function finishMapPan(event) {
  if (!mapDrag || event.pointerId !== mapDrag.pointerId) return;
  if (elements.floor.hasPointerCapture(event.pointerId)) elements.floor.releasePointerCapture(event.pointerId);
  mapDrag = null;
  applyCamera();
}
elements.floor.addEventListener("pointerup", finishMapPan);
elements.floor.addEventListener("pointercancel", finishMapPan);
elements.floor.addEventListener("keydown", (event) => {
  if (["+", "="].includes(event.key)) { event.preventDefault(); setMapZoom(mapZoom * ZOOM_STEP); return; }
  if (event.key === "-") { event.preventDefault(); setMapZoom(mapZoom / ZOOM_STEP); return; }
  if (["0", "Escape"].includes(event.key)) { event.preventDefault(); resetMapView(); return; }
  const step = event.shiftKey ? 50 : 20;
  if (event.key === "ArrowLeft") mapPanX -= step;
  else if (event.key === "ArrowRight") mapPanX += step;
  else if (event.key === "ArrowUp") mapPanY -= step;
  else if (event.key === "ArrowDown") mapPanY += step;
  else return;
  event.preventDefault(); applyCamera();
});

function clearMapPanArming() {
  mapSpacePressed = false;
  if (mapDrag?.pointerId !== undefined && elements.floor.hasPointerCapture(mapDrag.pointerId)) elements.floor.releasePointerCapture(mapDrag.pointerId);
  mapDrag = null;
  applyCamera();
}

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const inFormField = target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
  // Not gated on mode: Live and Offline share one map renderer and one set of
  // camera controls, so arming pan in only one of them would leave Offline with
  // working zoom buttons and a dead pan gesture.
  if (event.code === "Space" && !inFormField && currentView === "control") {
    mapSpacePressed = true;
    applyCamera();
  }
});
document.addEventListener("keyup", (event) => { if (event.code === "Space") clearMapPanArming(); });
window.addEventListener("blur", clearMapPanArming);
document.addEventListener("visibilitychange", () => { if (document.hidden) clearMapPanArming(); });

// A poll tick landing between mousedown and mouseup swallows the click. This is
// the direct analogue of the actionInFlight guard for that window. The 1s expiry
// is deliberate: if a pointerup is lost (released outside the window) the guard
// self-clears rather than stalling polling forever.
let pointerDownAt = null;
document.addEventListener("pointerdown", () => { pointerDownAt = Date.now(); }, true);
for (const type of ["pointerup", "pointercancel"]) document.addEventListener(type, () => { pointerDownAt = null; }, true);
const pointerInteractionActive = () => pointerDownAt !== null && Date.now() - pointerDownAt < 1_000;

/**
 * Boot gate: bare `/` shows the Control Room picker and never touches any
 * room's state; `/rooms/:id` hides the picker and boots the existing
 * single-room app unchanged underneath — see
 * Control_Rooms_SOW_v1_DRAFT.md §4.5/§4.6. Switching rooms is always a full
 * page navigation (never handled here), so this runs at most once per load.
 */
function renderRoomPicker(rooms) {
  const rows = rooms.map((room) => room.health === "READY"
    ? `<button type="button" class="room-picker-row" data-room-id="${escapeHtml(room.id)}"><strong>${escapeHtml(room.displayName ?? room.label)}</strong><span>${escapeHtml(room.mode)} · ${escapeHtml(statusLabel(room.simulationStatus))}</span></button>`
    : `<div class="room-picker-row" aria-disabled="true"><strong>${escapeHtml(room.displayName ?? room.label)}</strong><span>Unavailable</span></div>`).join("");
  setHtml(elements["room-picker-list"], rows || `<p class="workflow-prompt">No Control Rooms are configured.</p>`);
  elements["room-picker-list"].querySelectorAll("[data-room-id]").forEach((button) => {
    button.onclick = () => { window.location.href = `/rooms/${encodeURIComponent(button.dataset.roomId)}`; };
  });
}

async function bootRoomPicker() {
  elements["room-picker-view"].hidden = false;
  try {
    const { rooms } = await globalApi("/control-rooms");
    renderRoomPicker(rooms);
  } catch (error) {
    setHtml(elements["room-picker-list"], `<p class="load-error">${escapeHtml(error.message)}</p>`);
  }
}

/** One panel per monitor: no tiles, no console controls, the room's clock and agent status kept. */
function bootDisplayScreen() {
  announcePanelWindow({ roomId: currentControlRoomId, screen: displayScreen });
  document.body.classList.add("display-mode");
  document.body.dataset.display = displayScreen;
  document.title = `${DISPLAY_SCREENS[displayScreen]} — ResponseCompass`;
  const label = document.createElement("p");
  label.className = "display-screen-label";
  label.textContent = `${DISPLAY_SCREENS[displayScreen]} · ${currentControlRoomId}`;
  document.querySelector(".topbar > div:first-child").append(label);
  if (displayScreen === "analytics" || displayScreen === "pareto") switchView("analytics");
}

/**
 * Screens launcher: each panel asks whether to split it into this workspace or open it in its own
 * window. Analytics and Issue Pareto are views, not tiles, so they only open in their own window.
 */
function wireScreenLauncher() {
  const dialog = document.querySelector("#panel-chooser");
  const launcher = document.querySelector(".screen-launcher");
  const splitButton = dialog.querySelector('[data-choose="split"]');
  document.querySelectorAll("[data-open-screen]").forEach((item) => item.addEventListener("click", () => {
    const screen = item.dataset.openScreen;
    dialog.dataset.screen = screen;
    dialog.querySelector("#panel-chooser-title").textContent = `Open ${item.textContent.trim()}`;
    splitButton.hidden = !(TILE_SCREENS[screen] && tiling?.isTiling());
    launcher?.removeAttribute("open");
    dialog.showModal();
  }));
  dialog.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-choose]")?.dataset.choose;
    if (!choice) return;
    const screen = dialog.dataset.screen;
    if (choice === "split" && TILE_SCREENS[screen]) { panelWindows.dock(screen); window.CompassTiling?.activatePanel(TILE_SCREENS[screen]); }
    if (choice === "window") panelWindows.detach(screen, `/rooms/${encodeURIComponent(currentControlRoomId)}/display/${screen}`);
    dialog.close();
  });
  // Return focus to the launcher, which the dialog cannot reach once the menu is closed.
  dialog.addEventListener("close", () => launcher?.querySelector("summary")?.focus());
}

/**
 * Tells the server someone is using this room, so it does not pause the clock
 * for inactivity. Only real input on a visible page counts; the 1.5 s state
 * poll deliberately does not, or an unattended tab would keep a room running.
 */
const ACTIVITY_HEARTBEAT_MS = 60_000;
function startActivityHeartbeat() {
  let lastSentAt = 0;
  const send = () => {
    if (document.hidden || Date.now() - lastSentAt < ACTIVITY_HEARTBEAT_MS) return;
    lastSentAt = Date.now();
    roomApi("/activity", { method: "POST" }).catch((error) => reportClientError("activity_heartbeat", error));
  };
  for (const type of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) document.addEventListener(type, send, { passive: true, capture: true });
  document.addEventListener("visibilitychange", send);
}

function bootControlRoom() {
  lastSyncOk = null;
  startActivityHeartbeat();
  document.querySelector(".app-shell").hidden = false;
  paretoPanel = initParetoPanel(document.querySelector("#pareto-panel"), { roomApi, isVisible: () => currentView === "analytics" && !document.hidden });
  if (displayScreen) bootDisplayScreen();
  else workspaceNav = initWorkspaceNav({onReveal: () => scheduleProjectedLabelLayout(CAMERA_SETTLE_MS)});
  const stationKpiNode = document.querySelector("#station-kpi-tile");
  if (stationKpiNode) {
    stationKpisView = initStationKpis({
      element: stationKpiNode,
      request: roomApi,
      escape: escapeHtml,
      roomId: currentControlRoomId,
      getState: () => currentState,
    });
  }
  const loadboardsNode = document.querySelector("#loadboards-tile");
  if (loadboardsNode) {
    loadboardsView = initLoadboards({
      element: loadboardsNode,
      request: roomApi,
      escape: escapeHtml,
      roomId: currentControlRoomId,
      getState: () => currentState,
    });
  }
  const obligationsNode = document.querySelector("#obligations-tile");
  if (obligationsNode) {
    obligationsView = initObligations({
      element: obligationsNode,
      request: roomApi,
      escape: escapeHtml,
      roomId: currentControlRoomId,
      getState: () => currentState,
    });
  }
  const handlerEpisodesNode = document.querySelector("#handler-episodes-tile");
  if (handlerEpisodesNode) {
    handlerEpisodesView = initHandlerEpisodes({
      element: handlerEpisodesNode,
      request: roomApi,
      escape: escapeHtml,
      roomId: currentControlRoomId,
      getState: () => currentState,
    });
  }
  const calibrationsNode = document.querySelector("#calibrations-tile");
  if (calibrationsNode) {
    calibrationsView = initCalibrations({
      element: calibrationsNode,
      request: roomApi,
      escape: escapeHtml,
      roomId: currentControlRoomId,
      getState: () => currentState,
    });
  }
  const changeoverReadinessNode = document.querySelector("#changeover-readiness-tile");
  if (changeoverReadinessNode) {
    changeoverReadinessView = initChangeoverReadiness({
      element: changeoverReadinessNode,
      request: roomApi,
      escape: escapeHtml,
      getRoomId: () => currentControlRoomId,
    });
  }
  if (!displayScreen) {
    panelWindows = createPanelWindows({ roomId: currentControlRoomId });
    tiling = initTiling({ onMapResize: () => scheduleProjectedLabelLayout(CAMERA_SETTLE_MS), displayHref: (screen) => `/rooms/${encodeURIComponent(currentControlRoomId)}/display/${screen}`, panelWindows });
    wireScreenLauncher();
  }
  if (!displayScreen) askView = initAsk({ escape: escapeHtml, request: roomApi, getState: () => currentState, onState: render, getContextIssueId: () => selectedIssueId, navigate: navigateToCitation });
  document.querySelector('#active-room-name').textContent = currentControlRoomId;
  roomApi("/state").then((state) => { render(state); setStatusBarSync(true); }).catch((error) => { reportClientError("initial_state_load", error); setHtml(elements.floor, `<p class="load-error">${escapeHtml(error.message)}</p>`); });
  setInterval(async () => { if (actionInFlight || pointerInteractionActive()) return; try { render(await roomApi("/state")); setStatusBarSync(true); if (currentView === "analytics") await loadAnalytics(); } catch (error) { setStatusBarSync(false); reportClientError("poll_state", error); } }, 1_500);
}

if (currentControlRoomId) bootControlRoom(); else bootRoomPicker();
