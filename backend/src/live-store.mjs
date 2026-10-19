import { publicInvestigationState, investigationDTO, reportDTO } from './investigation-public.mjs';
import { initializeFaults, assertNoFaultTruth } from './fault-truth.mjs';
/**
 * Single-process journaled persistence for v4 Live Simulation.
 * The journal contains storage patches, never domain events: OperationalEvent is audit-only and never rebuilds canonical state.
 */
import { writeFile, readdir, stat } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { dirname, resolve } from "node:path";
import {createLiveDraft, cloneDraftValue, freezeLiveState} from "./live-draft.mjs";
import {createLiveJournal, readLiveCheckpoint, writeLiveCheckpoint} from "./live-journal.mjs";
const coordinators = new Map();
import { compassDataPath } from "./data-root.mjs";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { createPublicLiveSnapshot, validateLiveState } from "./live-schema.mjs";
import { migrateLiveState } from "./live-migration.mjs";
import { compactHistory, retentionDays, resetRetention, analyticHistory } from "./history-retention.mjs";
import { writeHistoryArchive, archivedIssue, assertHistoryArchivePresent } from "./history-archive.mjs";
import { createIssueAuditRecord, redactIssueAuditRecord } from "./live-schema.mjs";

async function createPreV2Backup(filePath, state) {
  try {
    await writeFile(`${filePath}.pre-v2.bak`, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

function normalizeCurrentDraft(state) {
  for (const issue of state.issues ?? []) issue.complexity ??= issue.issueClass === "C" ? "COMPLEX" : "STANDARD";
  initializeFaults(state);
  return state;
}

export function createLiveStore({ filePath = process.env.COMPASS_LIVE_STATE_PATH ?? compassDataPath("live-simulation.json"), seedFactory = createLiveSeed,
  historyRetentionDays = retentionDays(), archiveRoot = `${dirname(filePath)}/history-archive`, beforeCommit = async () => {},
  checkpointEvery = 512, checkpointBytes = 16 * 1024 * 1024, persistenceHook = async () => {},
  onCheckpointError = error => process.emitWarning(`Live checkpoint deferred: ${error.message}`),
} = {}) {
  let cachedState = null;
  const key=resolve(filePath);
  if(!coordinators.has(key))coordinators.set(key,{queue:Promise.resolve(),generation:0});
  const coordinator=coordinators.get(key);
  let cachedGeneration=-1;
  const journal=createLiveJournal(filePath,{hook:persistenceHook});
  function publish(state){cachedState=freezeLiveState(state);coordinator.generation++;cachedGeneration=coordinator.generation;}
  async function checkpointIfDue(){
    if(journal.records>=checkpointEvery||journal.bytes>=checkpointBytes){
      try{await journal.checkpoint(cachedState);}catch(error){onCheckpointError(error);}
    }
  }

  async function ensureLoaded() {
    if (cachedState && cachedGeneration===coordinator.generation) return cachedState;
    cachedState=null;
    const checkpoint = await readLiveCheckpoint(filePath);
    const loaded = checkpoint ? await journal.recover(checkpoint) : null;
    if (loaded) {
      // Always pass persisted data through the idempotent migrator before
      // validation. This also repairs states written by an earlier 2.0 build
      // whose assignment rows predate role-history tracking.
      const migrated = migrateLiveState(loaded);
      // The migrator validates every returned state. Do not repeat its full
      // scan or serialize the entire history twice just to compare it.
      await assertHistoryArchivePresent(archiveRoot, migrated);
      const migrationChanged = !isDeepStrictEqual(migrated, loaded);
      const retentionBefore = structuredClone(migrated.historyRetention);
      const bundles = compactHistory(migrated, historyRetentionDays, { force: true });
      if (bundles.length) validateLiveState(migrated);
      await writeHistoryArchive(archiveRoot, migrated, bundles);
      if (migrationChanged || !isDeepStrictEqual(retentionBefore, migrated.historyRetention)) {
        if (migrationChanged) await createPreV2Backup(filePath, loaded);
        await beforeCommit({ label: "load-retention", state: migrated });
        await journal.append(loaded,migrated,[{op:'set',path:[],value:migrated}]);
      }
      publish(migrated);
    } else {
      const oldJournal=await stat(`${filePath}.journal`).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      if(oldJournal?.size)throw Error('Live journal has no base checkpoint');
      const state=validateLiveState(initializeFaults(seedFactory()));
      await writeLiveCheckpoint(filePath,state);
      publish(state);
    }
    return cachedState;
  }

  /**
   * Serialize every read and write onto one chain, but never let the *stored*
   * chain stay rejected. A failed write must not become a permanent failure for
   * everything after it: the caller still sees its own error, while the next
   * operation starts from a settled chain.
   *
   * This matters more than it looks. Reads run through here too, and the
   * scheduler tick reads before it writes — so a chain that stayed rejected
   * would stop the tick from ever queueing another mutation, and the process
   * could never recover on its own. That is a bricked server, not a blip.
   */
  function queue(operation) {
    const next = coordinator.queue.catch(() => {}).then(operation);
    coordinator.queue = next.catch(() => {});
    return next;
  }

  return {
    project(projector) { return queue(async () => projector(await ensureLoaded())); },
    /**
     * The published state itself. It is deeply frozen and never changed after
     * publication (each mutation builds a new copy-on-write version), so a
     * snapshot needs no 30 MB clone; writing to it throws instead of corrupting.
     */
    async snapshot() {
      return queue(async () => ensureLoaded());
    },
    async publicSnapshot() {
      return queue(async () => createPublicLiveSnapshot(await ensureLoaded(), { validated: true }));
    },
    async investigationRecord(id) {
      return queue(async()=>{
        const state=await ensureLoaded();
        let row=state.investigations?.find((item)=>item.id===id);
        if(!row && state.historyRetention?.investigationArchives?.[id]) {
          const bundle=await archivedIssue(archiveRoot,state,state.historyRetention.investigationArchives[id]);
          row=bundle?.investigations?.find((item)=>item.id===id);
        }
        return row?investigationDTO(row):null;
      });
    },
    async reportRecord(id) {
      return queue(async()=>{
        const state=await ensureLoaded();
        let row=state.fieldReports?.find((item)=>item.id===id);
        if(!row && state.historyRetention?.reportArchives?.[id]) {
          const bundle=await archivedIssue(archiveRoot,state,state.historyRetention.reportArchives[id]);
          row=bundle?.fieldReports?.find((item)=>item.id===id);
        }
        return row?reportDTO(row):null;
      });
    },
    async issueAudit(issueId) {
      return queue(async () => {
        const state = await ensureLoaded();
        if (state.issues.some((row) => row.id === issueId)) return createIssueAuditRecord(state, issueId);
        const bundle = await archivedIssue(archiveRoot, state, issueId);
        return bundle ? redactIssueAuditRecord({ ...bundle, ...(bundle.investigations?{investigations:bundle.investigations.map((row)=>investigationDTO(row))}:{}), ...(bundle.fieldReports?{fieldReports:bundle.fieldReports.map(reportDTO)}:{}), ...((state.investigations ?? []).some((row)=>row.issueId===issueId) ? {investigations:publicInvestigationState({investigations:state.investigations.filter((row)=>row.issueId===issueId),fieldReports:[]}).investigations} : {}), equipment: state.equipment.find((row) => row.id === bundle.issue.equipmentId) ?? null }) : null;
      });
    },
    async stationHistory(equipmentId, { before = null, limit = 100 } = {}) {
      return queue(async () => {
        const state = analyticHistory(await ensureLoaded());
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Object.assign(new Error("History page limit must be between one and one hundred"), { statusCode: 400 });
        const issues = state.issues.filter((row) => !equipmentId || row.equipmentId === equipmentId).sort((a, b) => Date.parse(b.resolvedAt ?? b.raisedAt) - Date.parse(a.resolvedAt ?? a.raisedAt) || b.id.localeCompare(a.id));
        const cursor = before ? issues.findIndex((row) => row.id === before) : -1;
        if (before && cursor === -1) throw Object.assign(new Error("Unknown issue history cursor"), { statusCode: 400 });
        const start = cursor + 1;
        const page = issues.slice(start, start + limit);
        assertNoFaultTruth(page);
        return { mode: "LIVE", simulationTime: state.simulationState.simulationTime, total: issues.length, issues: structuredClone(page), next: start + page.length < issues.length ? page.at(-1)?.id : null };
      });
    },
    mutate(label, mutation) {
      return queue(async () => {
        const before = await ensureLoaded();
        const transaction = createLiveDraft(before);
        try {
          const result = await mutation(transaction.draft);
          normalizeCurrentDraft(transaction.draft);
          transaction.draft.revision = before.revision + 1;
          const bundles = compactHistory(transaction.draft, historyRetentionDays);
          // Detach the caller's result while the draft is still open: it may hold draft rows.
          const detachedResult=cloneDraftValue(result);
          const {state:draft,patches} = transaction.finish();
          validateLiveState(draft,{previous:before});
          freezeLiveState(draft);
          await writeHistoryArchive(archiveRoot, draft, bundles);
          await beforeCommit({ label, state: draft });
          await journal.append(before,draft,patches);
          publish(draft);
          await checkpointIfDue();
          return { label, revision: draft.revision, result: detachedResult };
        } catch(error) {
          transaction.abort();cachedState=null;throw error;
        }
      });
    },
    checkpoint() { return queue(async()=>{await ensureLoaded();await journal.checkpoint(cachedState);}); },
    reset() {
      return queue(async () => {
        const state = validateLiveState(initializeFaults(seedFactory()));
        const previous = await ensureLoaded();
        const archiveFiles = await readdir(archiveRoot).catch((error) => { if (error.code === "ENOENT") return []; throw error; });
        if (previous.historyRetention?.epoch || archiveFiles.length) resetRetention(state, (previous.historyRetention?.epoch ?? 0) + 1);
        await beforeCommit({label:'reset',state});
        await journal.append(previous,state,[{op:'set',path:[],value:state}]);
        publish(state);
        try{await journal.checkpoint(state);}catch(error){onCheckpointError(error);}
        return structuredClone(state);
      });
    },
  };
}
