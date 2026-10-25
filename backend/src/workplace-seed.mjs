/** A pinned bootstrap template, never the live state of plant-1. */
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { migrateLiveState } from './live-migration.mjs';
import { createSeedLoadboards } from '../seed/loadboards.mjs';
import { createSeedCalibrations } from '../seed/calibrations.mjs';
export function createWorkplaceSeed() {
  const state = migrateLiveState(createLiveSeed());
  state.loadboardInventory = { boards: createSeedLoadboards(), reservations: [] };
  state.calibrations = createSeedCalibrations();
  state.handlerJam = { alarms: [], runs: [], plannedStops: [], handlerContext: [] };
  state.simulationState.status = 'PAUSED'; state.simulationState.speedMultiplier = 1;
  return state;
}
