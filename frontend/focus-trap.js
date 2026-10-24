/**
 * Focus trap utility for accessible modal dialogs and drawers.
 * Traps Tab / Shift+Tab within container focusable elements.
 */
export function trapFocus(container, event) {
  if (event.key !== "Tab") return;
  const focusables = Array.from(
    container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter((el) => !el.disabled && (el.offsetParent !== null || el.getClientRects().length > 0) && window.getComputedStyle(el).visibility !== "hidden");

  if (!focusables.length) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (event.shiftKey) {
    if (document.activeElement === first || !container.contains(document.activeElement)) {
      event.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last || !container.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }
}
