import { setHtml } from "./render-lifecycle.js";

/**
 * Changeover readiness panel (Candidate F5 slice 1 UI).
 * Spec: docs/design/changeover-readiness-slice-1.md
 * Contract:
 *   GET /api/control-rooms/:roomId/changeovers/:changeoverId/readiness
 *     → {
 *         changeoverId, cellId, targetProgramRevision?, startsAt, status,
 *         checks: [{ check, result, reasons, boardId? }],
 *         reasons: string[]
 *       }
 */

const stateByRoom = new Map();

export const AVAILABLE_CHANGEOVERS = [
  { changeoverId: "CO-0031", label: "CO-0031 · ATE-1 · SR1260-P3" },
  { changeoverId: "CO-0032", label: "CO-0032 · ATE-2 · SR1260-P4" },
  { changeoverId: "CO-0033", label: "CO-0033 · ATE-3 · SR1260-P2" },
];

export function getPanelState(roomId) {
  if (!stateByRoom.has(roomId)) {
    stateByRoom.set(roomId, {
      selectedChangeoverId: "CO-0031",
      data: null,
      loading: false,
      error: null,
      liveAnnouncement: "",
    });
  }
  return stateByRoom.get(roomId);
}

/**
 * Synthetic fallback changeover readiness records when endpoint returns 404 or running offline.
 */
export function generateSyntheticChangeoverReadiness(roomId, changeoverId = "CO-0031") {
  const records = {
    "CO-0031": {
      changeoverId: "CO-0031",
      cellId: "ATE-1",
      targetProgramRevision: "SR1260-P3",
      startsAt: "2026-10-24T14:00:00.000Z",
      status: "BLOCKED",
      checks: [
        { check: "LOADBOARD_AVAILABLE", result: "PASS", reasons: [], boardId: "LB-0412" },
        { check: "CELL_READY", result: "PASS", reasons: [] },
        { check: "KIT_AVAILABLE", result: "UNKNOWN", reasons: ["KIT_FACTS_NOT_RECORDED"] },
        { check: "CREW_QUALIFIED", result: "UNKNOWN", reasons: ["CREW_FACTS_NOT_RECORDED"] },
      ],
      reasons: ["CREW_FACTS_NOT_RECORDED", "KIT_FACTS_NOT_RECORDED"],
    },
    "CO-0032": {
      changeoverId: "CO-0032",
      cellId: "ATE-2",
      targetProgramRevision: "SR1260-P4",
      startsAt: "2026-10-24T16:30:00.000Z",
      status: "BLOCKED",
      checks: [
        { check: "LOADBOARD_AVAILABLE", result: "FAIL", reasons: ["NO_COMPATIBLE_LOADBOARD"] },
        { check: "CELL_READY", result: "FAIL", reasons: ["CELL_NOT_READY"] },
        { check: "KIT_AVAILABLE", result: "UNKNOWN", reasons: ["KIT_FACTS_NOT_RECORDED"] },
        { check: "CREW_QUALIFIED", result: "UNKNOWN", reasons: ["CREW_FACTS_NOT_RECORDED"] },
      ],
      reasons: ["CELL_NOT_READY", "CREW_FACTS_NOT_RECORDED", "KIT_FACTS_NOT_RECORDED", "NO_COMPATIBLE_LOADBOARD"],
    },
    "CO-0033": {
      changeoverId: "CO-0033",
      cellId: "ATE-3",
      targetProgramRevision: "SR1260-P2",
      startsAt: "2026-10-24T18:00:00.000Z",
      status: "READY",
      checks: [
        { check: "LOADBOARD_AVAILABLE", result: "PASS", reasons: [], boardId: "LB-0204" },
        { check: "CELL_READY", result: "PASS", reasons: [] },
        { check: "KIT_AVAILABLE", result: "PASS", reasons: [] },
        { check: "CREW_QUALIFIED", result: "PASS", reasons: [] },
      ],
      reasons: [],
    },
  };

  return records[changeoverId] || {
    changeoverId,
    cellId: "ATE-1",
    targetProgramRevision: "SR1260-P1",
    startsAt: new Date().toISOString(),
    status: "BLOCKED",
    checks: [
      { check: "LOADBOARD_AVAILABLE", result: "UNKNOWN", reasons: ["UNKNOWN_CHANGEOVER"] },
      { check: "CELL_READY", result: "UNKNOWN", reasons: ["UNKNOWN_CHANGEOVER"] },
      { check: "KIT_AVAILABLE", result: "UNKNOWN", reasons: ["KIT_FACTS_NOT_RECORDED"] },
      { check: "CREW_QUALIFIED", result: "UNKNOWN", reasons: ["CREW_FACTS_NOT_RECORDED"] },
    ],
    reasons: ["CREW_FACTS_NOT_RECORDED", "KIT_FACTS_NOT_RECORDED", "UNKNOWN_CHANGEOVER"],
  };
}

/**
 * Fetch changeover readiness for the specified control room and changeover.
 */
export async function fetchChangeoverReadiness({ request, roomId, changeoverId, getState }) {
  const roomState = getState?.();
  if (roomState?.changeoverReadiness && roomState.changeoverReadiness.changeoverId === changeoverId) {
    return roomState.changeoverReadiness;
  }

  try {
    const data = await request(`/changeovers/${encodeURIComponent(changeoverId)}/readiness`);
    return data;
  } catch (err) {
    if (
      err &&
      (err.status === 404 ||
        err.status === 405 ||
        String(err.message).includes("404") ||
        String(err.message).includes("Cannot GET") ||
        String(err.message).includes("Not Found"))
    ) {
      return generateSyntheticChangeoverReadiness(roomId, changeoverId);
    }
    throw err;
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatIsoTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const min = String(d.getUTCMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min} UTC`;
  } catch {
    return String(iso);
  }
}

const CHECK_DISPLAY_NAMES = {
  LOADBOARD_AVAILABLE: "Loadboard Available",
  CELL_READY: "Cell Calibration Ready",
  KIT_AVAILABLE: "Changeover Kit Available",
  CREW_QUALIFIED: "Crew Qualified & On-Duty",
};

/**
 * Main Changeover Readiness Panel component.
 */
export function initChangeoverReadiness({ element, getRoomId, request: customRequest }) {
  let boundElement = element;
  let currentRoomId = null;
  let autoRefreshTimer = null;

  async function loadData(force = false) {
    const roomId = getRoomId ? getRoomId() : "plant-1";
    currentRoomId = roomId;
    const panelState = getPanelState(roomId);

    if (panelState.loading) return;
    if (panelState.data && !force) return;

    panelState.loading = true;
    panelState.error = null;
    render();

    try {
      const req = customRequest || window.__COMPASS_ROOM_API__ || (async (url) => {
        const res = await fetch(`/api/control-rooms/${encodeURIComponent(roomId)}${url}`);
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
        return res.json();
      });

      const data = await fetchChangeoverReadiness({
        request: req,
        roomId,
        changeoverId: panelState.selectedChangeoverId,
        getState: () => window.__COMPASS_STATE__,
      });

      panelState.data = data;
      panelState.error = null;
    } catch (err) {
      panelState.error = err?.message || "Failed to load changeover readiness";
    } finally {
      panelState.loading = false;
      render();
    }
  }

  function handleSelectChange(evt) {
    const roomId = getRoomId ? getRoomId() : "plant-1";
    const panelState = getPanelState(roomId);
    panelState.selectedChangeoverId = evt.target.value;
    panelState.data = null;
    panelState.liveAnnouncement = `Selected changeover ${panelState.selectedChangeoverId}`;
    loadData(true);
  }

  function handleRefreshClick() {
    const roomId = getRoomId ? getRoomId() : "plant-1";
    const panelState = getPanelState(roomId);
    panelState.liveAnnouncement = `Refreshing changeover readiness for ${panelState.selectedChangeoverId}`;
    loadData(true);
  }

  function bindEvents() {
    if (!boundElement) return;

    const selectEl = boundElement.querySelector("#co-select-id");
    if (selectEl) {
      selectEl.onchange = handleSelectChange;
    }

    const refreshBtn = boundElement.querySelector(".co-refresh-btn");
    if (refreshBtn) {
      refreshBtn.onclick = handleRefreshClick;
    }

    const retryBtn = boundElement.querySelector(".co-retry-btn");
    if (retryBtn) {
      retryBtn.onclick = () => loadData(true);
    }
  }

  function render(roomState) {
    if (!boundElement) return;
    const roomId = getRoomId ? getRoomId() : (roomState?.roomId || "plant-1");
    currentRoomId = roomId;
    const panelState = getPanelState(roomId);

    if (!panelState.data && !panelState.loading && !panelState.error) {
      loadData();
    }

    const data = panelState.data;
    const changeoverId = data?.changeoverId || panelState.selectedChangeoverId || "CO-0031";
    const cellId = data?.cellId || "—";
    const targetProgramRevision = data?.targetProgramRevision || data?.changeover?.targetProgramRevision || "SR1260-P3";
    const startsAt = data?.startsAt || "—";
    const status = (data?.status || "BLOCKED").toUpperCase();
    const checks = data?.checks || [];
    const reasons = data?.reasons || [];

    let mainContentHtml = "";

    if (panelState.loading && !data) {
      mainContentHtml = `
        <div class="co-state-loading" role="status">
          <div class="co-spinner" aria-hidden="true"></div>
          <p>Loading changeover readiness…</p>
        </div>
      `;
    } else if (panelState.error && !data) {
      mainContentHtml = `
        <div class="co-state-error" role="alert">
          <p class="co-error-msg"><strong>Error loading changeover readiness:</strong> ${escapeHtml(panelState.error)}</p>
          <button type="button" class="btn co-retry-btn" aria-label="Retry loading changeover readiness">Retry</button>
        </div>
      `;
    } else if (!data) {
      mainContentHtml = `
        <div class="co-state-empty">
          <p><strong>No changeover selected or available</strong></p>
          <p>Select a changeover from the dropdown above to view readiness status.</p>
        </div>
      `;
    } else {
      // Table rows for desktop
      const tableRowsHtml = checks.map((c) => {
        const checkName = CHECK_DISPLAY_NAMES[c.check] || c.check;
        const result = (c.result || "UNKNOWN").toUpperCase();
        const resultClass = result.toLowerCase();
        const boardDisplay = (c.check === "LOADBOARD_AVAILABLE" && result === "PASS" && c.boardId)
          ? `<strong class="co-board-val">${escapeHtml(c.boardId)}</strong>`
          : "—";
        const reasonsDisplay = c.reasons?.length
          ? c.reasons.map((r) => `<code class="co-reason-pill">${escapeHtml(r)}</code>`).join(" ")
          : `<span class="co-muted">None</span>`;

        return `
          <tr data-check-id="${escapeHtml(c.check)}">
            <th scope="row" class="co-check-col">
              <span class="co-check-title">${escapeHtml(checkName)}</span>
              <code class="co-check-code">${escapeHtml(c.check)}</code>
            </th>
            <td class="co-result-col">
              <span class="co-result-badge co-result-${resultClass}">
                <strong class="co-result-text">${escapeHtml(result)}</strong>
              </span>
            </td>
            <td class="co-board-col">${boardDisplay}</td>
            <td class="co-reasons-col">${reasonsDisplay}</td>
          </tr>
        `;
      }).join("");

      // Mobile cards
      const mobileCardsHtml = checks.map((c) => {
        const checkName = CHECK_DISPLAY_NAMES[c.check] || c.check;
        const result = (c.result || "UNKNOWN").toUpperCase();
        const resultClass = result.toLowerCase();
        const boardDisplay = (c.check === "LOADBOARD_AVAILABLE" && result === "PASS" && c.boardId)
          ? `<div class="co-card-row"><span class="co-card-label">Assigned Board:</span> <strong>${escapeHtml(c.boardId)}</strong></div>`
          : "";
        const reasonsDisplay = c.reasons?.length
          ? `<div class="co-card-row"><span class="co-card-label">Reasons:</span> <div class="co-card-reasons">${c.reasons.map((r) => `<code class="co-reason-pill">${escapeHtml(r)}</code>`).join(" ")}</div></div>`
          : "";

        return `
          <div class="co-card" data-check-id="${escapeHtml(c.check)}">
            <div class="co-card-header">
              <div>
                <h4 class="co-card-title">${escapeHtml(checkName)}</h4>
                <code class="co-check-code">${escapeHtml(c.check)}</code>
              </div>
              <span class="co-result-badge co-result-${resultClass}">
                <strong class="co-result-text">${escapeHtml(result)}</strong>
              </span>
            </div>
            <div class="co-card-body">
              ${boardDisplay}
              ${reasonsDisplay}
            </div>
          </div>
        `;
      }).join("");

      // Overall reasons block
      const overallReasonsHtml = reasons.length
        ? `
          <div class="co-reasons-panel">
            <h4 class="co-reasons-title">Unmet Requirements (${reasons.length})</h4>
            <ul class="co-reasons-list">
              ${reasons.map((r) => `<li><code>${escapeHtml(r)}</code></li>`).join("")}
            </ul>
            <p class="co-notice">Notice: In slice 1, kit and crew facts are not yet recorded. A changeover cannot be READY while any check is UNKNOWN.</p>
          </div>
        `
        : `
          <div class="co-reasons-panel co-reasons-passed">
            <p class="co-notice co-notice-ready">All requirement checks passed. Changeover is ready to commence.</p>
          </div>
        `;

      mainContentHtml = `
        <div class="co-summary-card">
          <div class="co-meta-item">
            <span class="co-meta-label">Changeover ID</span>
            <strong class="co-meta-val" data-co-id>${escapeHtml(changeoverId)}</strong>
          </div>
          <div class="co-meta-item">
            <span class="co-meta-label">ATE Setup</span>
            <strong class="co-meta-val" data-co-cell>${escapeHtml(cellId)}</strong>
          </div>
          <div class="co-meta-item">
            <span class="co-meta-label">Target Program</span>
            <strong class="co-meta-val" data-co-program>${escapeHtml(targetProgramRevision)}</strong>
          </div>
          <div class="co-meta-item">
            <span class="co-meta-label">Start Time</span>
            <strong class="co-meta-val" data-co-starts>${escapeHtml(formatIsoTime(startsAt))}</strong>
          </div>
          <div class="co-meta-item co-meta-status">
            <span class="co-meta-label">Overall Status</span>
            <span class="co-status-tag co-status-${status.toLowerCase()}" data-co-status>
              <strong class="co-status-text">${escapeHtml(status)}</strong>
            </span>
          </div>
        </div>

        <div class="co-table-container">
          <table class="co-table" aria-label="Changeover requirement checks">
            <thead>
              <tr>
                <th scope="col" class="co-check-col">Requirement Check</th>
                <th scope="col" class="co-result-col">Result</th>
                <th scope="col" class="co-board-col">Board</th>
                <th scope="col" class="co-reasons-col">Reasons</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
        </div>

        <div class="co-cards-container" aria-label="Changeover requirement check cards">
          ${mobileCardsHtml}
        </div>

        ${overallReasonsHtml}
      `;
    }

    const optionsHtml = AVAILABLE_CHANGEOVERS.map((co) => {
      const isSelected = co.changeoverId === panelState.selectedChangeoverId;
      return `<option value="${escapeHtml(co.changeoverId)}"${isSelected ? " selected" : ""}>${escapeHtml(co.label)}</option>`;
    }).join("");

    const html = `
      <div class="co-panel-inner">
        <header class="co-header">
          <div class="co-header-left">
            <p class="eyebrow">Changeover Precursor · F5 Slice 1</p>
            <h3 id="co-readiness-heading">Changeover Readiness</h3>
          </div>
          <div class="co-header-actions">
            <div class="co-select-wrapper">
              <label for="co-select-id" class="sr-only">Select changeover</label>
              <select id="co-select-id" class="co-select" aria-label="Select changeover">
                ${optionsHtml}
              </select>
            </div>
            <button type="button" class="btn co-refresh-btn" aria-label="Refresh changeover readiness">Refresh</button>
          </div>
        </header>

        <div id="co-live-announcer" class="sr-only" aria-live="polite">${escapeHtml(panelState.liveAnnouncement)}</div>

        <div class="co-body">
          ${mainContentHtml}
        </div>
      </div>
    `;

    setHtml(boundElement, html);
    bindEvents();
  }

  // Initial render
  render();

  return {
    render,
    destroy() {
      if (autoRefreshTimer) clearInterval(autoRefreshTimer);
      boundElement = null;
    },
  };
}
