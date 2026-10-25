/** Durable username ownership, bounded lifetime and one-time run metadata. */
import { mkdir, readdir, readFile, writeFile, rename, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { workplaceIdentity, WORKPLACE_RUN_MS, WORKPLACE_IDLE_MS, WORKPLACE_CAP } from './workplace-identity.mjs';
export function createWorkplaceLifecycle({ dataRoot, rooms, build, now = Date.now }) {
  const root = join(dataRoot, 'control-rooms'), entries = new Map();
  let queue = Promise.resolve(), lastSweep = -Infinity;
  const run = operation => { const next = queue.catch(() => {}).then(operation); queue = next.catch(() => {}); return next; };
  async function save(entry) {
    const directory = join(root, entry.roomId); await mkdir(directory, { recursive: true });
    const temporary = join(directory, `workplace.${randomUUID()}.tmp`);
    try { await writeFile(temporary, JSON.stringify(entry), { mode: 0o600 }); await rename(temporary, join(directory, 'workplace.json')); }
    finally { await rm(temporary, { force: true }); }
  }
  async function enforce(roomId) {
    const entry = entries.get(roomId), room = rooms.get(roomId);
    if (!entry || !room || room.health !== 'READY') return;
    if (now() >= entry.runEndsAt) {
      const state = await room.liveStore.snapshot();
      if (state.simulationState.status === 'RUNNING') await room.liveRuntime.pause({ reason: 'WORKPLACE_RUN_COMPLETE' });
    }
  }
  async function sweep(force = false) {
    if (!force && now() - lastSweep < 3_600_000) return;
    lastSweep = now();
    for (const [roomId, entry] of entries) if (now() - entry.lastSeenAt >= WORKPLACE_IDLE_MS) {
      const room = rooms.get(roomId);
      // Only validated username-derived directories are ever eligible for removal.
      if (room?.health === 'READY') await room.liveRuntime.pause({ reason: 'WORKPLACE_EXPIRED' });
      rooms.delete(roomId); await rm(join(root, roomId), { recursive: true, force: true }); entries.delete(roomId);
    }
  }
  return {
    async initialize() { return run(async () => {
      await mkdir(root, { recursive: true });
      for (const directory of await readdir(root, { withFileTypes: true })) {
        if (!directory.isDirectory() || !/^workplace-[a-z0-9-]+-[a-f0-9]{16}$/.test(directory.name)) continue;
        let entry;
        try { entry = JSON.parse(await readFile(join(root, directory.name, 'workplace.json'), 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') continue; throw new Error('Invalid workplace metadata'); }
        const identity = workplaceIdentity(entry.username);
        if (entry.roomId !== directory.name || identity.roomId !== entry.roomId || ['createdAt', 'lastSeenAt', 'runEndsAt'].some(key => !Number.isFinite(entry[key])) || entry.runEndsAt !== entry.createdAt + WORKPLACE_RUN_MS) throw new Error('Invalid workplace metadata');
        entries.set(entry.roomId, entry);
      }
      await sweep(true);
      for (const entry of entries.values()) {
        try { await access(join(root, entry.roomId, 'live-simulation.json')); }
        catch { rooms.set(entry.roomId, { id: entry.roomId, label: entry.username, demo: true, health: 'FAILED', reason: 'Workplace state unavailable' }); continue; }
        const room = await build(entry.roomId, entry.username); rooms.set(entry.roomId, room); await enforce(entry.roomId);
      }
    }); },
    ensure(username) { return run(async () => {
      await sweep(); const identity = workplaceIdentity(username); let entry = entries.get(identity.roomId);
      if (entry) {
        if (rooms.get(entry.roomId)?.health !== 'READY') throw Object.assign(new Error('Workplace unavailable'), { statusCode: 503 });
        entry = { ...entry, lastSeenAt: now() }; await save(entry); entries.set(entry.roomId, entry); await enforce(entry.roomId);
        return { ...identity, created: false };
      }
      if (entries.size >= WORKPLACE_CAP) throw Object.assign(new Error('Workplace limit reached; try again later'), { statusCode: 503 });
      const createdAt = now();
      entry = { ...identity, createdAt, lastSeenAt: createdAt, runEndsAt: createdAt + WORKPLACE_RUN_MS };
      // Durable creation marker precedes run activation. A restart never replays start.
      await save(entry); entries.set(entry.roomId, entry);
      const room = await build(entry.roomId, identity.username); rooms.set(entry.roomId, room);
      if (room.health !== 'READY') throw Object.assign(new Error('Workplace unavailable'), { statusCode: 503 });
      await room.liveStore.mutate('workplace-create-run', state => { state.simulationState.status = 'RUNNING'; state.simulationState.speedMultiplier = 1; });
      return { ...identity, created: true };
    }); },
    touch(roomId) { return run(async () => {
      const entry = entries.get(roomId); if (!entry) return false;
      const next = { ...entry, lastSeenAt: now() }; await save(next); entries.set(roomId, next); return true;
    }); },
    sweep() { return run(() => sweep()); },
    enforceRun: enforce,
    async enforceRuns() { for (const id of entries.keys()) await enforce(id); },
    isWorkplace: id => entries.has(id),
    entry: id => entries.get(id) ? { ...entries.get(id) } : null,
  };
}
