import { deviceForStation } from '../src/device-catalog.mjs';

/**
 * Deterministic three-floor building layout.
 *
 * The layout is generated rather than hand-written because the building holds
 * roughly seventy machines, but it uses no randomness: the same input always
 * produces the same coordinates, so seeds, fixtures, and tests stay reproducible.
 *
 * The six original ground-floor machines keep their exact original coordinates.
 * Scenario A's evidence, baselines, and expected winner are derived from those
 * positions, so moving them would silently change committed fixtures.
 */

export const FLOOR_WIDTH = 150;
export const FLOOR_HEIGHT = 100;
export const BUILDING_FLOORS = 3;
export const EQUIPMENT_PER_FLOOR = 24;

/** Machines that predate the multi-floor building. Pinned, never regenerated. */
const PINNED_GROUND_FLOOR = [
  { id: "EQ-01", name: "Station 1", x: 10, y: 10 },
  { id: "EQ-02", name: "Station 2", x: 30, y: 15 },
  { id: "EQ-03", name: "Station 3", x: 70, y: 20 },
  { id: "EQ-04", name: "Station 4", x: 50, y: 50 },
  { id: "EQ-05", name: "Station 5", x: 20, y: 80 },
  { id: "EQ-06", name: "Station 6", x: 85, y: 75 },
];

const GRID_COLUMNS = 6;
const GRID_ROWS = 5;
const MARGIN_X = 14;
const MARGIN_Y = 12;
/** A generated machine must sit at least this far from a pinned one. */
const MIN_SEPARATION = 13;

/** Every grid position on a floor, in a fixed order. */
function gridSlots() {
  const slots = [];
  const stepX = (FLOOR_WIDTH - MARGIN_X * 2) / (GRID_COLUMNS - 1);
  const stepY = (FLOOR_HEIGHT - MARGIN_Y * 2) / (GRID_ROWS - 1);
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      slots.push({
        x: Math.round(MARGIN_X + column * stepX),
        y: Math.round(MARGIN_Y + row * stepY),
      });
    }
  }
  return slots;
}

function farEnoughFromPinned(slot) {
  return PINNED_GROUND_FLOOR.every((pinned) => Math.hypot(pinned.x - slot.x, pinned.y - slot.y) >= MIN_SEPARATION);
}

/**
 * Build the full equipment list for the building.
 *
 * Ground floor keeps the six pinned machines and fills the remainder from the
 * grid, skipping slots that would sit on top of a pinned machine. Upper floors
 * use the grid directly. Ids continue from EQ-07 so no existing id is reused.
 */
export function createBuildingEquipment() {
  const equipment = PINNED_GROUND_FLOOR.map((item) => ({ ...item, floor: 1, status: "NORMAL" }));
  let sequence = PINNED_GROUND_FLOOR.length;

  for (let floor = 1; floor <= BUILDING_FLOORS; floor += 1) {
    const available = floor === 1 ? gridSlots().filter(farEnoughFromPinned) : gridSlots();
    const needed = floor === 1 ? EQUIPMENT_PER_FLOOR - PINNED_GROUND_FLOOR.length : EQUIPMENT_PER_FLOOR;
    if (available.length < needed) throw new Error(`Floor ${floor} layout cannot place ${needed} machines`);
    for (const slot of available.slice(0, needed)) {
      sequence += 1;
      const id = `EQ-${String(sequence).padStart(2, "0")}`;
      equipment.push({ id, name: `Station ${sequence}`, x: slot.x, y: slot.y, floor, status: "NORMAL" });
    }
  }

  // Scenario A raises ISS-104 against EQ-04, which must present as needing attention.
  equipment.find((item) => item.id === "EQ-04").status = "ATTENTION_REQUIRED";
  return equipment.map(item => ({ ...item, ...deviceForStation(item.id) }));
}
