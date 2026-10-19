import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentFrom, poll } from '../../scripts/watch-codex-handover.mjs';
const board = (mode = 'RUN', task = 'N1', detail = 'Implement provider') => `### Watcher control\n| codex | ${mode} (round 12) |\n### Assignments\n**Current task per agent**\n| codex | ${task} | 12 |\nFinished tasks\n**Round 11 (old)**\nOld review\n**Round 12 (today)**\n${detail}\n### Merge log\n`;
test('watcher obeys STOP/no task and fingerprints only the current assignment', () => {
  assert.equal(assignmentFrom(board('STOP')), null);
  assert.equal(assignmentFrom(board('RUN', 'none')), null);
  assert.equal(assignmentFrom('malformed board'), null);
  assert.equal(assignmentFrom(board()).fingerprint, assignmentFrom(board().replace('Old review', 'Archived review')).fingerprint);
  assert.notEqual(assignmentFrom(board()).fingerprint, assignmentFrom(board('RUN', 'N1', 'Revised provider')).fingerprint);
});
test('watcher delivers a changed assignment exactly once, persists acceptance, and retries failures', () => {
  let state = {}, calls = 0;
  const options = { readBoard: () => board(), readState: () => state, saveState: next => { state = next; }, queue: text => { calls++; assert.match(text, /execute the current assignment/); }, log: () => {} };
  assert.equal(poll(options), true);
  poll(options);
  assert.equal(calls, 1);
  options.readBoard = () => board('RUN', 'N2');
  assert.throws(() => poll({ ...options, queue: () => { throw new Error('delivery failed'); } }), /delivery failed/);
  poll(options);
  assert.equal(calls, 2);
  options.readBoard = () => board('STOP');
  assert.equal(poll(options), false);
  assert.equal(calls, 2);
});
