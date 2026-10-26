import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createWorkplaceSeed } from "../src/workplace-seed.mjs";

const seedRoot = fileURLToPath(new URL("../seed/demo-control-rooms/", import.meta.url));

test("every workplace starts from the full plant-1 demo dataset, paused, with its history archive", async () => {
  const { state, historyRoot } = await createWorkplaceSeed();
  assert.equal(state.simulationState.status, "PAUSED");
  assert.equal(state.simulationState.speedMultiplier, 1);
  assert.ok(state.issues.length > 0, "issues come from the demo dataset");
  assert.equal(state.loadboardInventory.boards.length, 3);
  assert.equal(historyRoot, join(seedRoot, "plant-1.json.history"));
  await access(historyRoot);
});

test("each call returns an independent copy, so one workplace cannot change another's template", async () => {
  const first = await createWorkplaceSeed();
  first.state.issues.length = 0;
  const second = await createWorkplaceSeed();
  assert.ok(second.state.issues.length > 0);
});
