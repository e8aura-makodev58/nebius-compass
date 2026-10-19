import assert from "node:assert/strict";
import test from "node:test";
import { parseStoredLayout } from "../../frontend/tiling.js";

function saved(ids = ["map", "context", "issues", "events", "staffing", "investigation"]) {
  return {
    version: 1,
    layout: {
      grid: { width: 1200, height: 750, orientation: "HORIZONTAL", root: {
        type: "branch", data: ids.map((id) => ({ type: "leaf", size: 300, data: { id: `group-${id}`, views: [id], activeView: id } })),
      } },
      panels: Object.fromEntries(ids.map((id) => [id, { id, contentComponent: id, tabComponent: "tile" }])),
      activeGroup: "group-map",
    },
  };
}
const parse = (value) => parseStoredLayout(JSON.stringify(value));
test("stored tiling accepts exactly the known panels and resets persisted constraints/params", () => {
  const value = saved();
  value.layout.panels.map.minimumWidth = 0;
  value.layout.panels.map.params = { selector: "#foreign" };
  value.layout.grid.maximizedNode = { location: [0] };
  const layout = parse(value);
  assert.equal(layout.panels.map.minimumWidth, 300);
  assert.equal(layout.panels.map.params, undefined);
  assert.equal(layout.grid.maximizedNode, undefined);
  assert.equal(layout.grid.root.data[0].data.locked, true);
});
test("stored tiling rejects invalid, old, oversized, hidden, detached or foreign layouts", () => {
  for (const raw of [null, "broken", "{}", "x".repeat(200_001)]) assert.equal(parseStoredLayout(raw), null);
  const changes = [
    (s) => { s.version = 0; },
    (s) => { s.layout.floatingGroups = [{}]; },
    (s) => { s.layout.popoutGroups = [{}]; },
    (s) => { s.layout.edgeGroups = {}; },
    (s) => { s.layout.grid.orientation = "bogus"; },
    (s) => { s.layout.grid.width = 0; },
    (s) => { s.layout.panels.map.contentComponent = "foreign"; },
    (s) => { s.layout.panels.extra = s.layout.panels.map; },
    (s) => { delete s.layout.panels.map; },
    (s) => { s.layout.grid.root.data.pop(); },
    (s) => { s.layout.grid.root.data[0].visible = false; },
    (s) => { s.layout.grid.root.data[0].size = 0; },
    (s) => { s.layout.grid.root.data[0].data.views = ["map", "context"]; },
    (s) => { s.layout.grid.root.data[0].data.views = ["foreign"]; },
    (s) => { s.layout.grid.root.data[1].data.views = ["map"]; },
    (s) => { s.layout.grid.root.data[1].data.id = "group-map"; },
  ];
  for (const change of changes) { const value = saved(); change(value); assert.equal(parse(value), null, String(change)); }
});

test("four-panel stored layouts reset so the new Staffing tile is never hidden", () => {
 const old=saved();delete old.layout.panels.staffing;old.layout.grid.root.data.pop();assert.equal(parse(old),null);
});
test("a layout saved before the Field reports tile resets to the default", () => {
  assert.equal(parse(saved(["map", "context", "issues", "events", "staffing"])), null);
});
