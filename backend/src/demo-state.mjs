import { createSeedCalibrations } from '../seed/calibrations.mjs';
import { readFileSync } from "node:fs";
import { createBuildingEquipment } from "../seed/floor-layout.mjs";

const seedUrl = new URL("../seed/scenario-a-state.json", import.meta.url);
const rawSeed = JSON.parse(readFileSync(seedUrl, "utf8"));

/**
 * The seed file carries the canonical responders, issues, and history. Equipment
 * comes from the deterministic three-floor layout, which pins the six original
 * ground-floor machines to their original coordinates.
 */
const scenarioASeed = { ...rawSeed, calibrations: createSeedCalibrations(), equipment: createBuildingEquipment() };

/**
 * Return an independent, canonical initial state for every demo reset.
 * No caller may mutate the module-level seed object.
 */
export function createInitialDemoState() {
  return structuredClone(scenarioASeed);
}

export const resetDemoState = createInitialDemoState;
