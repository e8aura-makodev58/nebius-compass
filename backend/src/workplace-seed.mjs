/** The bootstrap template every workplace copies: the full plant-1 demo dataset, never the live plant-1 state. */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { migrateLiveState } from './live-migration.mjs';
import { readDemoSeedState } from './demo-seed-reader.mjs';
const defaultSeedRoot = fileURLToPath(new URL('../seed/demo-control-rooms/', import.meta.url));
export async function createWorkplaceSeed({ seedRoot = defaultSeedRoot } = {}) {
  const state = migrateLiveState(await readDemoSeedState(join(seedRoot, 'plant-1.json')));
  state.simulationState.status = 'PAUSED'; state.simulationState.speedMultiplier = 1;
  return { state, historyRoot: join(seedRoot, 'plant-1.json.history') };
}
