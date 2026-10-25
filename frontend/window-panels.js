/**
 * Coordinates panel windows of one control room. Each panel is either docked in the
 * workspace or detached to its own window; the live windows are the only record.
 * Messages: `open` (a display window shows a screen), `closed` (it went away),
 * `dock` (the workspace asks it to close) and `hello` (a new window asks who is open).
 */
export const PANEL_WINDOW_FEATURES = "popup,width=1100,height=760";
const channelName = (roomId) => `compass-panels:${roomId}`;

export function createPanelWindows({ roomId }) {
  const detached = new Set();
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  let channel = null;
  try {
    channel = new BroadcastChannel(channelName(roomId));
    channel.addEventListener("message", ({ data }) => {
      if (!data || typeof data.screen !== "string") return;
      if (data.type === "open" && !detached.has(data.screen)) { detached.add(data.screen); notify(); }
      if (data.type === "closed" && detached.delete(data.screen)) notify();
    });
    channel.postMessage({ type: "hello" });
  } catch { /* Without channels, detach still works; the workspace just cannot learn of closed windows. */ }
  return {
    isDetached: (screen) => detached.has(screen),
    /** Opens the display window; the screen is marked detached only if the browser allowed the pop-up. */
    detach(screen, href) {
      const opened = window.open(href, `compass-panel-${screen}`, PANEL_WINDOW_FEATURES);
      if (opened) { detached.add(screen); notify(); opened.focus(); }
      return opened;
    },
    dock(screen) {
      if (!detached.delete(screen)) return;
      channel?.postMessage({ type: "dock", screen });
      notify();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { listeners.clear(); channel?.close(); },
  };
}

/** Called once by a display window: announces it, answers `hello`, and closes on `dock`. */
export function announcePanelWindow({ roomId, screen }) {
  let channel = null;
  try { channel = new BroadcastChannel(channelName(roomId)); } catch { return; }
  const say = () => channel.postMessage({ type: "open", screen });
  channel.addEventListener("message", ({ data }) => {
    if (data?.type === "hello") say();
    if (data?.type === "dock" && data.screen === screen) window.close();
  });
  say();
  window.addEventListener("pagehide", () => {
    channel.postMessage({ type: "closed", screen });
    channel.close();
  });
}
