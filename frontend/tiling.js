import { createDockview, themeLight } from "./vendor/dockview/dockview.js";

const STORAGE_KEY = "responsecompass.tiling.v1";
const VERSION = 1;
const SIZE_CAP = 200_000;
const PANELS = {
  staffing: { selector: "#staffing-tile", title: "Staffing", minimumWidth: 260, minimumHeight: 180 },
  investigation: { selector: "#investigation-tile", title: "Field reports", minimumWidth: 260, minimumHeight: 180 },
  map: { selector: ".floor-section", title: "Floor map", minimumWidth: 300, minimumHeight: 220 },
  issues: { selector: "#issue-list", title: "Issues", minimumWidth: 180, minimumHeight: 130 },
  events: { selector: "#event-feed", title: "Event feed", minimumWidth: 180, minimumHeight: 130 },
  context: { selector: ".context-panel", title: "Dispatch / context", minimumWidth: 280, minimumHeight: 180 },
};

/** Validate before fromJSON: no hidden, missing, duplicate, foreign or detached tiles. */
export function parseStoredLayout(raw) {
  if (typeof raw !== "string" || raw.length > SIZE_CAP) return null;
  try {
    const record = JSON.parse(raw);
    const layout = record.layout;
    const ids = Object.keys(PANELS);
    if (record.version !== VERSION || !layout || !layout.grid || !layout.panels) return null;
    if (["floatingGroups", "popoutGroups"].some((key) => key in layout && (!Array.isArray(layout[key]) || layout[key].length)) || layout.edgeGroups) return null;
    if (Object.keys(layout.panels).length !== ids.length) return null;
    for (const id of ids) {
      const panel = layout.panels[id];
      if (!panel || panel.id !== id || panel.contentComponent !== id || panel.tabComponent !== "tile") return null;
      // Ignore persisted constraints and parameters; these belong to application code.
      layout.panels[id] = { id, contentComponent: id, tabComponent: "tile", title: PANELS[id].title, ...constraints(id) };
    }
    if (!["HORIZONTAL", "VERTICAL"].includes(layout.grid.orientation)) return null;
    if (![layout.grid.width, layout.grid.height].every((n) => Number.isFinite(n) && n > 0 && n < 100_000)) return null;
    const seen = new Set();
    const groups = new Set();
    function visit(node, depth = 0) {
      if (!node || depth > 12 || node.visible === false || (node.size !== undefined && (!Number.isFinite(node.size) || node.size <= 0))) throw new Error("Invalid grid node");
      if (node.type === "branch") {
        if (!Array.isArray(node.data) || node.data.length < 1 || node.data.length > ids.length) throw new Error("Invalid branch");
        node.data.forEach((child) => visit(child, depth + 1));
      } else if (node.type === "leaf") {
        const group = node.data;
        if (!group || typeof group.id !== "string" || groups.has(group.id) || !Array.isArray(group.views) || group.views.length !== 1 || !ids.includes(group.views[0]) || seen.has(group.views[0])) throw new Error("Invalid tile");
        seen.add(group.views[0]); groups.add(group.id);
        node.data = { id: group.id, views: group.views, activeView: group.views[0], locked: true };
      } else throw new Error("Invalid node type");
    }
    visit(layout.grid.root);
    if (seen.size !== ids.length) return null;
    return { grid: { root: layout.grid.root, width: layout.grid.width, height: layout.grid.height, orientation: layout.grid.orientation }, panels: layout.panels, activeGroup: groups.has(layout.activeGroup) ? layout.activeGroup : undefined };
  } catch { return null; }
}
function constraints(id) { return { minimumWidth: PANELS[id].minimumWidth, minimumHeight: PANELS[id].minimumHeight }; }

/** Move the original DOM nodes; never clone application state, IDs or listeners. */
export function initTiling({ onMapResize = () => {} } = {}) {
  const dashboard = document.querySelector(".dashboard");
  const regions = Object.fromEntries(Object.entries(PANELS).map(([id, spec]) => {
    const selected = dashboard.querySelector(spec.selector);
    return [id, id === "issues" || id === "events" ? selected.parentElement : selected];
  }));
  const anchors = Object.fromEntries(Object.entries(regions).map(([id, node]) => {
    const anchor = document.createComment(`tiling-home:${id}`);
    node.before(anchor);
    return [id, anchor];
  }));
  const host = document.createElement("div");
  host.id = "floor-tiles";
  host.setAttribute("aria-label", "Resizable Live Floor tiles");
  const reset = document.createElement("button");
  reset.type = "button"; reset.id = "reset-layout"; reset.className = "secondary-button";
  reset.textContent = "Reset layout";
  document.querySelector(".control-room-search").prepend(reset);
  const media = matchMedia("(min-width: 901px)");
  let api = null, saveTimer = null, adjusting = false, lastLayout = null, refreshFrame = null;
  let splitObserver = null;
  const handles = new WeakSet();
  const hostObserver = new ResizeObserver(() => {
    if (!api || !host.clientWidth || !host.clientHeight) return;
    api.layout(host.clientWidth, host.clientHeight);
    ensureFits();
  });
  hostObserver.observe(host);
  const mapObserver = new ResizeObserver(() => onMapResize());
  mapObserver.observe(document.querySelector("#floor"));
  function store() {
    if (!api || adjusting || api.hasMaximizedGroup() || !host.clientWidth || !host.clientHeight) return;
    try {
      lastLayout = JSON.stringify({ version: VERSION, layout: api.toJSON() });
      if (lastLayout.length <= SIZE_CAP) localStorage.setItem(STORAGE_KEY, lastLayout);
    } catch { /* The workspace remains usable if storage is blocked or full. */ }
  }
  function ensureFits() {
    if (!api || adjusting || api.hasMaximizedGroup() || !host.clientWidth || !host.clientHeight) return;
    if (api.minimumWidth > host.clientWidth || api.minimumHeight > host.clientHeight) {
      adjusting = true;
      defaultLayout();
      api.layout(host.clientWidth, host.clientHeight);
      adjusting = false;
    }
  }
  function scheduleSave() {
    if (adjusting) return;
    clearTimeout(saveTimer); saveTimer = setTimeout(store, 200);
    if (refreshFrame === null) refreshFrame = requestAnimationFrame(() => { refreshFrame = null; ensureFits(); prepareDividers(); });
  }
  function defaultLayout() {
    api.clear();
    const width = host.clientWidth;
    const height = host.clientHeight;
    api.addPanel({ id: "map", component: "map", tabComponent: "tile", title: PANELS.map.title, ...constraints("map") });
    api.addPanel({ id: "context", component: "context", tabComponent: "tile", title: PANELS.context.title, position: { referencePanel: "map", direction: "right" }, initialWidth: Math.min(440, width * .36), ...constraints("context") });
    api.addPanel({ id: "issues", component: "issues", tabComponent: "tile", title: PANELS.issues.title, position: { referencePanel: "map", direction: "below" }, initialHeight: Math.max(160, height * .28), ...constraints("issues") });
    api.addPanel({ id: "events", component: "events", tabComponent: "tile", title: PANELS.events.title, position: { referencePanel: "issues", direction: "right" }, ...constraints("events") });
    api.addPanel({ id: "investigation", component: "investigation", tabComponent: "tile", title: PANELS.investigation.title, position: { referencePanel: "context", direction: "below" }, initialHeight: Math.max(220, height * .4), ...constraints("investigation") });
    api.addPanel({ id: "staffing", component: "staffing", tabComponent: "tile", title: PANELS.staffing.title, position: { referencePanel: "investigation", direction: "below" }, initialHeight: Math.max(180, height * .25), ...constraints("staffing") });
    api.getPanel("context").api.setSize({ width: Math.min(440, width * .36) });
    api.getPanel("issues").api.setSize({ height: Math.max(160, height * .28) });
    api.getPanel("map").api.setActive();
  }
  function prepareDividers() {
    for (const sash of host.querySelectorAll(".dv-sash")) {
      const box = sash.getBoundingClientRect();
      const vertical = box.height > box.width;
      sash.tabIndex = 0; sash.setAttribute("role", "separator");
      sash.setAttribute("aria-label", vertical ? "Resize tiles horizontally" : "Resize tiles vertically");
      sash.setAttribute("aria-orientation", vertical ? "vertical" : "horizontal");
      sash.setAttribute("aria-valuemin", "0");
      sash.setAttribute("aria-valuemax", String(vertical ? host.clientWidth : host.clientHeight));
      sash.setAttribute("aria-valuenow", String(Math.round(vertical ? box.x - host.getBoundingClientRect().x : box.y - host.getBoundingClientRect().y)));
      if (handles.has(sash)) continue;
      handles.add(sash);
      sash.addEventListener("keydown", (event) => {
        const b = sash.getBoundingClientRect(), alongX = b.height > b.width;
        const direction = alongX ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
        if (!direction[event.key]) return;
        event.preventDefault(); event.stopPropagation();
        const delta = direction[event.key] * (event.shiftKey ? 40 : 10);
        const x = b.x + b.width / 2, y = b.y + b.height / 2;
        // Drive the library's own constrained splitter path, including both neighbours.
        sash.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
        document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x + (alongX ? delta : 0), clientY: y + (alongX ? 0 : delta), pointerId: 1 }));
        document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
        prepareDividers();
      });
    }
  }
  function create() {
    if (api) return;
    dashboard.classList.add("tiling-active"); dashboard.append(host); reset.hidden = false;
    api = createDockview(host, {
      theme: { ...themeLight, gap: 0 },
      disableFloatingGroups: true,
      disableAutoResizing: true,
      createComponent: ({ id }) => {
        if (!regions[id]) throw new Error("Unknown tile");
        const element = document.createElement("div");
        element.className = "tiling-content"; element.dataset.tile = id;
        return { element, init() { element.append(regions[id]); }, layout() { if (id === "map") onMapResize(); } };
      },
      createTabComponent: () => {
        const element = document.createElement("span"); element.className = "tiling-tab-title";
        return { element, init({ title }) { element.textContent = title; } };
      },
      createRightHeaderActionComponent: (group) => {
        const element = document.createElement("button");
        element.type = "button"; element.className = "tiling-maximize";
        function update() {
          const name = group.activePanel?.title ?? "tile";
          element.textContent = group.api.isMaximized() ? "Restore" : "Maximise";
          element.setAttribute("aria-label", `${element.textContent} ${name}`);
        }
        element.addEventListener("click", () => {
          if (group.api.isMaximized()) group.api.exitMaximized();
          else { store(); group.api.maximize(); }
        });
        const listener = group.api.onDidActivePanelChange(update);
        const maximizeListener = group.api.onDidConstraintsChange(update);
        return { element, init() { update(); }, dispose() { listener.dispose(); maximizeListener.dispose(); } };
      },
      getTabContextMenuItems: () => ["maximize"],
    });
    api.onDidAddGroup((group) => { group.api.locked = true; });
    api.onWillShowOverlay((event) => { if (event.position === "center") event.preventDefault(); });
    api.onWillDrop((event) => { if (event.position === "center") event.preventDefault(); });
    api.onDidMaximizedGroupChange(() => {
      for (const group of api.groups) {
        const button = group.element.querySelector(".tiling-maximize");
        if (button) { button.textContent = group.api.isMaximized() ? "Restore" : "Maximise"; button.setAttribute("aria-label", `${button.textContent} ${group.activePanel?.title ?? "tile"}`); }
      }
      onMapResize();
    });
    api.onDidLayoutChange(scheduleSave);
    api.layout(host.clientWidth, host.clientHeight);
    adjusting = true;
    let stored;
    try { stored = parseStoredLayout(lastLayout ?? localStorage.getItem(STORAGE_KEY)); } catch { stored = null; }
    try {
      if (stored) api.fromJSON(stored); else defaultLayout();
    } catch { defaultLayout(); }
    api.layout(host.clientWidth, host.clientHeight);
    adjusting = false;
    ensureFits();
    splitObserver = new MutationObserver(() => {
      if (refreshFrame === null) refreshFrame = requestAnimationFrame(() => { refreshFrame = null; ensureFits(); prepareDividers(); });
    });
    splitObserver.observe(host, { childList: true, subtree: true });
    prepareDividers(); store();
  }
  function destroy() {
    if (!api && !host.isConnected) return;
    store(); clearTimeout(saveTimer); splitObserver?.disconnect();
    if (refreshFrame !== null) cancelAnimationFrame(refreshFrame);
    refreshFrame = null;
    // Restore nodes before disposing renderer containers, preserving their identity.
    for (const [id, node] of Object.entries(regions)) anchors[id].after(node);
    api?.dispose(); api = null; host.replaceChildren(); host.remove();
    dashboard.classList.remove("tiling-active"); reset.hidden = true; onMapResize();
  }
  reset.addEventListener("click", () => {
    if (!api) return;
    adjusting = true; api.exitMaximizedGroup(); defaultLayout(); api.layout(host.clientWidth, host.clientHeight); adjusting = false;
    prepareDividers(); store(); onMapResize();
  });
  const change = () => { if (media.matches) create(); else destroy(); };
  media.addEventListener("change", change);
  window.addEventListener("pagehide", store);
  reset.hidden = !media.matches;
  try { change(); } catch (error) { destroy(); console.error("Tiling initialization failed", error); }
  return { dispose() { destroy(); mapObserver.disconnect(); hostObserver.disconnect(); media.removeEventListener("change", change); window.removeEventListener("pagehide", store); reset.remove(); Object.values(anchors).forEach((anchor) => anchor.remove()); } };
}
