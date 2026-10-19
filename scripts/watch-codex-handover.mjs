/** Local worker automation: queue a real follow-up in the same Codex session. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function assignmentFrom(doc) {
  const control = doc.split('### Watcher control')[1]?.split('### Assignments')[0] ?? '';
  const assignments = doc.split('### Assignments')[1]?.split('### Merge log')[0] ?? '';
  const row = assignments.split('\n').find(line => /^\| codex \|/.test(line));
  if (!/^\| codex \| RUN\b/m.test(control) || !row || /^\| codex \| none\b/i.test(row)) return null;
  const round = row.split('|')[3]?.trim();
  // Only changes to the active round/row wake Codex, not another worker's edits.
  const sections = assignments.split(/(?=\*\*Round \d+ \()/);
  const detail = sections.find(section => section.startsWith(`**Round ${round} (`)) ?? '';
  const fingerprint = createHash('sha256').update(`${row}\n${detail}`).digest('hex');
  return { row, fingerprint };
}

export function poll({ readBoard, queue, readState, saveState, log = console.log }) {
  const assignment = assignmentFrom(readBoard());
  if (!assignment) { log('Watcher stopped: STOP, missing assignment, or no task.'); return false; }
  const state = readState();
  if (state.fingerprint !== assignment.fingerprint) {
    queue(`Handover watcher: the Codex assignment on master changed: ${assignment.row}. Read git show master:handover.md, sync master according to the protocol, and execute the current assignment in this worktree. Preserve existing authorized work; do not spawn a second worker or restart the watcher. Report and commit your handoff when complete.`);
    // Save only after queue acceptance; failed delivery retries next tick.
    saveState({ fingerprint: assignment.fingerprint, queuedAt: new Date().toISOString() });
    log(`Queued assignment wake-up: ${assignment.row}`);
  }
  return true;
}

function main() {
  const thread = process.env.CODEX_THREAD_ID;
  if (!thread || !/^[\da-f-]{36}$/i.test(thread)) throw new Error('CODEX_THREAD_ID must identify the existing worker session');
  mkdirSync('.cache/codex-watcher', { recursive: true });
  const statePath = `.cache/codex-watcher/${thread}.json`;
  const readBoard = () => execFileSync('git', ['show', 'master:handover.md'], { encoding: 'utf8', timeout: 15_000 });
  const readState = () => { try { return JSON.parse(readFileSync(statePath, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; } };
  const saveState = state => writeFileSync(statePath, JSON.stringify(state) + '\n', { mode: 0o600 });
  // Explicit acknowledgement when starting during work prevents a redundant wake-up.
  if (process.argv.includes('--ack-current')) {
    const current = assignmentFrom(readBoard());
    if (current) saveState({ fingerprint: current.fingerprint, acknowledgedAt: new Date().toISOString() });
  }
  const tick = () => {
    try {
      if (!poll({ readBoard, readState, saveState,
        queue: message => execFileSync('codex', ['queue', '--thread', thread, '--message', message], { encoding: 'utf8', timeout: 30_000 }),
        log: message => console.log(`${new Date().toISOString()} ${message}`),
      })) process.exit(0);
    } catch (error) { console.error(`${new Date().toISOString()} Watcher error: ${error.message}`); }
  };
  tick();
  setInterval(tick, 300_000);
  console.log(`Watching master every 300s; delivery thread ${thread}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
