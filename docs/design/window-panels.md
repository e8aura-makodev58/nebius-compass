# Panel windows: split into the workspace or detach to its own window

Status: **design for review, implementation on branch `claude`.** Frontend only; no backend, data or
simulation change. Synthetic, domain-neutral data only.

## 1. Problem

- The Screens launcher offers 8 panels, not all 12 workspace panels. Station KPIs, Loadboards, Obligations,
  Handler episodes, Calibrations and Changeover readiness are missing.
- Their "Open in window" tile button sends screen ids such as `stationKpis`. The display route accepts only
  lowercase letters (`[a-z]+`) and the display screen table does not list them, so the popup falls back to the
  full operator console. That is why a KPI window looks wrong.
- Opening a panel always detaches it. There is no way to bring a panel back into the main workspace.

## 2. Model

Each panel is in exactly one place at a time:

- **Docked:** a tile in the main workspace (the default).
- **Detached:** in its own window. Its tile in the main workspace becomes a placeholder with "Bring back".

Panel ids are the existing workspace ids (`stationKpis`, `loadboards`, …). Display URLs use the same ids:
`/rooms/:roomId/display/:panelId`. The old lowercase URLs (`map`, `issues`, …) keep working.

Analytics and Issue Pareto are views, not workspace tiles. They have no dock, so they open in their own window
only.

## 3. Opening a panel

Two entry points, one choice:

- **Screens launcher:** each item opens a small chooser dialog, "Open <panel>", with:
  - **Split into workspace** (dock): the tile is shown again; if the panel is detached, its window closes.
  - **Open in its own window** (detach): opens the display window; the tile becomes a placeholder.
- **Tile button "Open in window":** detaches directly, as today.

On a phone (no tiling), the chooser offers only "Open in its own window". The stacked layout has no tile to split into.

## 4. Coordination between windows

- A `BroadcastChannel` named `compass-panels:<roomId>` joins the main window and its display windows of the same room.
- Messages: `open` (a display window shows panel `id`), `closed` (a display window closed), `dock` (main asks a
  display window to close), `hello` (a new main or display window asks who is open).
- **Live state only.** The main window does not store detached state. On load it sends `hello`, and every open
  display window answers `open`. A reload therefore keeps the placeholder if the window is still open.
- Display window: sends `open` on boot and on `hello`; sends `closed` on `pagehide`; closes itself on `dock`.
- If `BroadcastChannel` is unavailable, detach still opens the window; the placeholder simply does not update.

## 5. Placeholder

- Shown in the tile's content area: panel name, "Open in its own window", and a "Bring back" button.
- Its focusable controls are in tab order, labelled, and the placeholder keeps the tile's size.
- The panel's real DOM stays in the page, hidden, so its state and listeners are kept.

## 6. Acceptance (E2E, `e2e/window-panels.spec.mjs`)

- The Screens launcher lists all 12 workspace panels plus Analytics and Issue Pareto.
- A launcher choice opens the chooser; "Open in its own window" opens a popup at
  `/rooms/plant-1/display/<panelId>` that shows only that panel, with the panel's own name in the label.
- The Station KPIs tile's "Open in window" opens its panel, not the operator console.
- While detached, the tile shows the placeholder; "Bring back" closes the popup and restores the tile.
- Closing the popup by hand restores the tile.
- A reload with a popup still open shows the placeholder again.
- Choosing "Split into workspace" on a detached panel from the launcher brings it back.
- Phone width: the chooser shows only the window option; no horizontal scroll.
- Keyboard: the chooser traps focus, Escape closes it and returns focus to the launcher item.
- The existing wall-display test (`e2e/tiling.spec.mjs`) still passes, and the tile count stays at six groups.

## 7. Open items

- Map detached: the map tile stays hidden while detached. Its size recalculation runs on re-dock.
- Two display windows for the same panel: the second `window.open` reuses the first.
