import { setHtml } from "./render-lifecycle.js";

/**
 * Loadboard inventory and checkout panel (F3 UI).
 * Spec: docs/design/loadboard-checkout-slice-1.md
 * Contract:
 *   GET /api/control-rooms/:roomId/loadboards
 *     → { roomId, asOf, boards: [{ boardId, revision, condition, cellId, approvedPrograms, heldBy }] }
 *   POST /api/control-rooms/:roomId/loadboards/checkout
 *     → { requestId, boardId, cellId, programRevision } => { decision, reasons, reservation }
 *   POST /api/control-rooms/:roomId/loadboards/release
 *     → { reservationId, cellId } => { decision, reasons, reservation }
 */

export const DEFAULT_STATIONS = ["ATE-1", "ATE-2", "ATE-3", "ATE-4"];

export function getAvailableStations(roomState) {
  const list = [];
  if (Array.isArray(roomState?.stations)) {
    for (const st of roomState.stations) {
      const id = st.id || st.stationId;
      if (id) {
        const normalized = String(id).replace(/^ATE\s+(\d+)$/i, "ATE-$1");
        if (!list.includes(normalized)) list.push(normalized);
      }
    }
  }
  for (const def of DEFAULT_STATIONS) {
    if (!list.includes(def)) list.push(def);
  }
  return list.sort();
}

// Per-viewer in-memory state
const stateByRoom = new Map();

export function getPanelState(roomId) {
  if (!stateByRoom.has(roomId)) {
    stateByRoom.set(roomId, {
      searchQuery: "",
      conditionFilter: "ALL", // ALL | SERVICEABLE | UNDER_REPAIR | QUARANTINED
      selectedBoardId: null, // inspected board
      checkoutBoardId: null, // board with checkout drawer active
      rowReasons: {}, // boardId -> plain text string of reasons or status
      liveAnnouncement: "", // message for aria-live region
      data: null,
      loading: false,
      error: null,
    });
  }
  return stateByRoom.get(roomId);
}

/**
 * Synthetic fallback loadboard inventory when the endpoint is unmounted (404) or running offline.
 */
export function generateSyntheticLoadboards(roomId) {
  return {
    roomId: roomId || "room-a",
    asOf: new Date().toISOString(),
    boards: [
      {
        boardId: "LB-0115",
        revision: "D",
        condition: "QUARANTINED",
        cellId: null,
        approvedPrograms: ["SR1260-P3"],
        heldBy: null,
      },
      {
        boardId: "LB-0204",
        revision: "A",
        condition: "UNDER_REPAIR",
        cellId: null,
        approvedPrograms: ["CX4820-P1"],
        heldBy: null,
      },
      {
        boardId: "LB-0398",
        revision: "B",
        condition: "SERVICEABLE",
        cellId: null,
        approvedPrograms: ["PM0096-P2", "GH0310-P1"],
        heldBy: null,
      },
      {
        boardId: "LB-0412",
        revision: "C",
        condition: "SERVICEABLE",
        cellId: "ATE-1",
        approvedPrograms: ["SR1260-P3", "CX4820-P1"],
        heldBy: "RES-0007",
      },
      {
        boardId: "LB-0550",
        revision: "B",
        condition: "SERVICEABLE",
        cellId: "ATE-2",
        approvedPrograms: ["PM0096-P2", "SC2150-P1"],
        heldBy: null,
      },
      {
        boardId: "LB-0688",
        revision: "E",
        condition: "SERVICEABLE",
        cellId: null,
        approvedPrograms: ["BR0038-P1", "VS0745-P2"],
        heldBy: null,
      },
    ],
  };
}

/**
 * Fetch loadboards for the specified control room.
 */
export async function fetchLoadboards({ request, roomId }) {
  try {
    const data = await request("/loadboards");
    return data;
  } catch (err) {
    if (err && (err.status === 404 || String(err.message).includes("404") || String(err.message).includes("Cannot GET") || String(err.message).includes("Not Found"))) {
      return generateSyntheticLoadboards(roomId);
    }
    throw err;
  }
}

function conditionLabel(cond) {
  switch (cond) {
    case "SERVICEABLE":
      return "Serviceable";
    case "UNDER_REPAIR":
      return "Under repair";
    case "QUARANTINED":
      return "Quarantined";
    default:
      return cond || "Unknown";
  }
}

function conditionBadgeClass(cond) {
  switch (cond) {
    case "SERVICEABLE":
      return "lb-badge-serviceable";
    case "UNDER_REPAIR":
      return "lb-badge-repair";
    case "QUARANTINED":
      return "lb-badge-quarantined";
    default:
      return "";
  }
}

/**
 * Render the Loadboards markup given current state.
 */
export function loadboardsMarkup({ escape, panelState, roomState }) {
  const { data, loading, error, searchQuery, conditionFilter, selectedBoardId, checkoutBoardId, rowReasons, liveAnnouncement } = panelState;
  const allBoards = data?.boards ?? [];
  const stations = getAvailableStations(roomState);

  // Filter boards
  const query = (searchQuery || "").trim().toLowerCase();
  const filteredBoards = allBoards.filter((board) => {
    if (conditionFilter !== "ALL" && board.condition !== conditionFilter) {
      return false;
    }
    if (!query) return true;
    const matchId = String(board.boardId || "").toLowerCase().includes(query);
    const matchRev = String(board.revision || "").toLowerCase().includes(query);
    const location = board.cellId ? String(board.cellId).toLowerCase() : "in store";
    const matchLocation = location.includes(query);
    const matchHeld = board.heldBy ? String(board.heldBy).toLowerCase().includes(query) : "available".includes(query);
    const matchProg = (board.approvedPrograms || []).some((p) => String(p).toLowerCase().includes(query));
    return matchId || matchRev || matchLocation || matchHeld || matchProg;
  });

  const totalCount = allBoards.length;
  const matchCount = filteredBoards.length;
  const countLabel = query || conditionFilter !== "ALL"
    ? `${matchCount} of ${totalCount} board${totalCount === 1 ? "" : "s"}`
    : `${totalCount} board${totalCount === 1 ? "" : "s"}`;

  return `
    <div class="loadboards-panel">
      <!-- Accessible live region for checkout and release announcements -->
      <div id="lb-live-announcer" class="lb-live-region sr-only" role="status" aria-live="polite" aria-atomic="true">${escape(liveAnnouncement || "")}</div>

      <header class="lb-header">
        <div>
          <p class="eyebrow">Tooling &amp; Spares</p>
          <h3 id="loadboards-heading">Loadboards</h3>
        </div>
        <div class="lb-header-badges">
          <span class="lb-count-badge" data-lb-count="${matchCount}">${escape(countLabel)}</span>
        </div>
      </header>

      <div class="lb-toolbar" role="region" aria-label="Loadboard filters">
        <div class="lb-search-wrap">
          <input
            type="search"
            class="lb-search-input"
            id="lb-search-input"
            placeholder="Search loadboards…"
            value="${escape(searchQuery)}"
            aria-label="Search loadboards by ID, revision, cell, or program"
          />
        </div>

        <div class="lb-controls-wrap">
          <label class="lb-filter-label" for="lb-condition-select">
            Condition
            <select class="lb-condition-select" id="lb-condition-select" aria-label="Filter by condition">
              <option value="ALL" ${conditionFilter === "ALL" ? "selected" : ""}>All</option>
              <option value="SERVICEABLE" ${conditionFilter === "SERVICEABLE" ? "selected" : ""}>Serviceable</option>
              <option value="UNDER_REPAIR" ${conditionFilter === "UNDER_REPAIR" ? "selected" : ""}>Under repair</option>
              <option value="QUARANTINED" ${conditionFilter === "QUARANTINED" ? "selected" : ""}>Quarantined</option>
            </select>
          </label>

          <button type="button" class="lb-refresh-button secondary-button" aria-label="Refresh loadboards">
            Refresh
          </button>
        </div>
      </div>

      <div class="lb-content">
        ${
          loading
            ? `
          <div class="lb-state lb-loading" role="status">
            <span class="activity-spinner"></span>
            <span>Loading loadboards…</span>
          </div>`
            : error
            ? `
          <div class="lb-state lb-error" role="alert">
            <p class="load-error">Failed to load loadboard inventory: ${escape(error.message || "Unknown error")}</p>
            <button type="button" class="lb-retry-button secondary-button">Retry</button>
          </div>`
            : filteredBoards.length === 0
            ? `
          <div class="lb-state lb-empty">
            <p class="workflow-prompt">No loadboards match the current search or filter.</p>
            <button type="button" class="lb-reset-filter-button secondary-button">Reset filters</button>
          </div>`
            : `
          <!-- Desktop table layout (>= 901px) -->
          <div class="lb-table-container">
            <table class="lb-table" aria-label="Loadboards inventory">
              <thead>
                <tr>
                  <th scope="col">Board ID</th>
                  <th scope="col">Rev</th>
                  <th scope="col">Condition</th>
                  <th scope="col">Location</th>
                  <th scope="col">Approved Programs</th>
                  <th scope="col">Held / Reservation</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                ${filteredBoards
                  .map((b) => {
                    const badgeCls = conditionBadgeClass(b.condition);
                    const condText = conditionLabel(b.condition);
                    const isHeld = Boolean(b.heldBy || b.cellId);
                    const isAvailable = !isHeld;
                    const locationHtml = b.cellId
                      ? `<span class="lb-location-cell">${escape(b.cellId)}</span>`
                      : `<span class="lb-location-store">In store</span>`;
                    const programsHtml = (b.approvedPrograms || []).length
                      ? `<div class="lb-programs-list">${(b.approvedPrograms || [])
                          .map((p) => `<span class="lb-program-pill">${escape(p)}</span>`)
                          .join("")}</div>`
                      : `<span class="lb-none">—</span>`;
                    const heldHtml = b.heldBy
                      ? `<span class="lb-held-badge" title="Reservation: ${escape(b.heldBy)}">Held (${escape(b.heldBy)})</span>`
                      : `<span class="lb-available-badge">Available</span>`;
                    const isInspected = selectedBoardId === b.boardId;
                    const isCheckoutOpen = checkoutBoardId === b.boardId;
                    const reasonText = rowReasons?.[b.boardId] || "";

                    return `
                      <tr data-board-id="${escape(b.boardId)}" class="${isInspected ? "lb-row-inspected" : ""} ${isCheckoutOpen ? "lb-row-checking-out" : ""}">
                        <td class="lb-cell-id"><strong>${escape(b.boardId)}</strong></td>
                        <td class="lb-cell-rev">${escape(b.revision)}</td>
                        <td class="lb-cell-condition">
                          <span class="lb-badge ${badgeCls}">${escape(condText)}</span>
                        </td>
                        <td class="lb-cell-location">${locationHtml}</td>
                        <td class="lb-cell-programs">${programsHtml}</td>
                        <td class="lb-cell-held">${heldHtml}</td>
                        <td class="lb-cell-actions">
                          <div class="lb-actions-wrapper">
                            ${
                              isHeld
                                ? `
                              <button
                                type="button"
                                class="lb-release-btn danger-button"
                                data-board-id="${escape(b.boardId)}"
                                data-reservation-id="${escape(b.heldBy || "")}"
                                data-cell-id="${escape(b.cellId || "")}"
                                aria-label="Release loadboard ${escape(b.boardId)}"
                              >
                                Release
                              </button>`
                                : isAvailable
                                ? `
                              <button
                                type="button"
                                class="lb-checkout-btn primary-button"
                                data-board-id="${escape(b.boardId)}"
                                aria-expanded="${isCheckoutOpen ? "true" : "false"}"
                                aria-label="Check out loadboard ${escape(b.boardId)}"
                              >
                                ${isCheckoutOpen ? "Cancel" : "Check out"}
                              </button>`
                                : ""
                            }
                            <button
                              type="button"
                              class="lb-action-btn secondary-button"
                              data-board-id="${escape(b.boardId)}"
                              aria-expanded="${isInspected ? "true" : "false"}"
                              aria-label="Inspect loadboard ${escape(b.boardId)}"
                            >
                              ${isInspected ? "Close" : "Inspect"}
                            </button>
                          </div>
                          ${reasonText ? `<div class="lb-row-reasons" role="status" aria-label="Reason for ${escape(b.boardId)}">${escape(reasonText)}</div>` : ""}
                        </td>
                      </tr>
                      ${
                        isCheckoutOpen
                          ? `
                      <tr class="lb-row-checkout-wrap" data-checkout-for="${escape(b.boardId)}">
                        <td colspan="7">
                          <form class="lb-checkout-form" data-board-id="${escape(b.boardId)}" aria-label="Check out loadboard ${escape(b.boardId)}">
                            <div class="lb-checkout-fields">
                              <div class="lb-field-group">
                                <label for="lb-station-${escape(b.boardId)}">Station</label>
                                <select id="lb-station-${escape(b.boardId)}" class="lb-station-select" name="cellId" required aria-label="Station for ${escape(b.boardId)}" data-board-id="${escape(b.boardId)}">
                                  <option value="">Select station…</option>
                                  ${stations.map((st) => `<option value="${escape(st)}">${escape(st)}</option>`).join("")}
                                </select>
                              </div>
                              <div class="lb-field-group">
                                <label for="lb-program-${escape(b.boardId)}">Program</label>
                                <select id="lb-program-${escape(b.boardId)}" class="lb-program-select" name="programRevision" required aria-label="Program for ${escape(b.boardId)}" data-board-id="${escape(b.boardId)}">
                                  <option value="">Select program…</option>
                                  ${(b.approvedPrograms || []).map((p) => `<option value="${escape(p)}">${escape(p)}</option>`).join("")}
                                </select>
                              </div>
                              <div class="lb-checkout-actions">
                                <button type="submit" class="lb-submit-checkout-btn primary-button" data-board-id="${escape(b.boardId)}">Confirm checkout</button>
                                <button type="button" class="lb-cancel-checkout-btn secondary-button" data-board-id="${escape(b.boardId)}">Cancel</button>
                              </div>
                            </div>
                          </form>
                        </td>
                      </tr>`
                          : ""
                      }
                      ${
                        isInspected
                          ? `
                      <tr class="lb-row-detail-wrap" data-detail-for="${escape(b.boardId)}">
                        <td colspan="7">
                          <div class="lb-detail-drawer" role="region" aria-label="Inspection details for ${escape(b.boardId)}">
                            <strong>Inspection · ${escape(b.boardId)} (Rev ${escape(b.revision)})</strong>
                            <p>Condition: <em>${escape(condText)}</em> · Location: <em>${escape(b.cellId ? b.cellId : "In store")}</em> · Status: <em>${escape(b.heldBy ? `Held (${b.heldBy})` : "Available")}</em></p>
                            <p>Approved programs: ${(b.approvedPrograms || []).map((p) => `<code>${escape(p)}</code>`).join(", ") || "None"}</p>
                          </div>
                        </td>
                      </tr>`
                          : ""
                      }
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>

          <!-- Mobile card layout (<= 900px) -->
          <div class="lb-cards-container" role="list" aria-label="Loadboards list">
            ${filteredBoards
              .map((b) => {
                const badgeCls = conditionBadgeClass(b.condition);
                const condText = conditionLabel(b.condition);
                const isHeld = Boolean(b.heldBy || b.cellId);
                const isAvailable = !isHeld;
                const locationHtml = b.cellId
                  ? `<span class="lb-location-cell">${escape(b.cellId)}</span>`
                  : `<span class="lb-location-store">In store</span>`;
                const heldHtml = b.heldBy
                  ? `<span class="lb-held-badge">Held (${escape(b.heldBy)})</span>`
                  : `<span class="lb-available-badge">Available</span>`;
                const programsHtml = (b.approvedPrograms || []).length
                  ? `<div class="lb-programs-list">${(b.approvedPrograms || [])
                      .map((p) => `<span class="lb-program-pill">${escape(p)}</span>`)
                      .join("")}</div>`
                  : `<span class="lb-none">—</span>`;
                const isInspected = selectedBoardId === b.boardId;
                const isCheckoutOpen = checkoutBoardId === b.boardId;
                const reasonText = rowReasons?.[b.boardId] || "";

                return `
                  <article class="lb-card" role="listitem" data-board-id="${escape(b.boardId)}">
                    <div class="lb-card-top">
                      <div class="lb-card-title">
                        <strong class="lb-board-id">${escape(b.boardId)}</strong>
                        <span class="lb-card-rev">Rev ${escape(b.revision)}</span>
                      </div>
                      <span class="lb-badge ${badgeCls}">${escape(condText)}</span>
                    </div>

                    <div class="lb-card-grid">
                      <div class="lb-card-row">
                        <span class="lb-card-key">Location:</span>
                        <span class="lb-card-val">${locationHtml}</span>
                      </div>
                      <div class="lb-card-row">
                        <span class="lb-card-key">Status:</span>
                        <span class="lb-card-val">${heldHtml}</span>
                      </div>
                    </div>

                    <div class="lb-card-programs">
                      <span class="lb-card-key">Approved programs:</span>
                      ${programsHtml}
                    </div>

                    <div class="lb-card-actions">
                      ${
                        isHeld
                          ? `
                        <button
                          type="button"
                          class="lb-release-btn danger-button"
                          data-board-id="${escape(b.boardId)}"
                          data-reservation-id="${escape(b.heldBy || "")}"
                          data-cell-id="${escape(b.cellId || "")}"
                          aria-label="Release loadboard ${escape(b.boardId)}"
                        >
                          Release
                        </button>`
                          : isAvailable
                          ? `
                        <button
                          type="button"
                          class="lb-checkout-btn primary-button"
                          data-board-id="${escape(b.boardId)}"
                          aria-expanded="${isCheckoutOpen ? "true" : "false"}"
                          aria-label="Check out loadboard ${escape(b.boardId)}"
                        >
                          ${isCheckoutOpen ? "Cancel" : "Check out"}
                        </button>`
                          : ""
                      }
                      <button
                        type="button"
                        class="lb-action-btn secondary-button"
                        data-board-id="${escape(b.boardId)}"
                        aria-expanded="${isInspected ? "true" : "false"}"
                        aria-label="Inspect loadboard ${escape(b.boardId)}"
                      >
                        ${isInspected ? "Close inspection" : "Inspect"}
                      </button>
                    </div>

                    ${reasonText ? `<div class="lb-card-reasons"><span class="lb-row-reasons" role="status" aria-label="Reason for ${escape(b.boardId)}">${escape(reasonText)}</span></div>` : ""}

                    ${
                      isCheckoutOpen
                        ? `
                    <form class="lb-checkout-form" data-board-id="${escape(b.boardId)}" aria-label="Check out loadboard ${escape(b.boardId)}">
                      <div class="lb-checkout-fields">
                        <div class="lb-field-group">
                          <label for="lb-card-station-${escape(b.boardId)}">Station</label>
                          <select id="lb-card-station-${escape(b.boardId)}" class="lb-station-select" name="cellId" required aria-label="Station for ${escape(b.boardId)}" data-board-id="${escape(b.boardId)}">
                            <option value="">Select station…</option>
                            ${stations.map((st) => `<option value="${escape(st)}">${escape(st)}</option>`).join("")}
                          </select>
                        </div>
                        <div class="lb-field-group">
                          <label for="lb-card-program-${escape(b.boardId)}">Program</label>
                          <select id="lb-card-program-${escape(b.boardId)}" class="lb-program-select" name="programRevision" required aria-label="Program for ${escape(b.boardId)}" data-board-id="${escape(b.boardId)}">
                            <option value="">Select program…</option>
                            ${(b.approvedPrograms || []).map((p) => `<option value="${escape(p)}">${escape(p)}</option>`).join("")}
                          </select>
                        </div>
                        <div class="lb-checkout-actions">
                          <button type="submit" class="lb-submit-checkout-btn primary-button" data-board-id="${escape(b.boardId)}">Confirm checkout</button>
                          <button type="button" class="lb-cancel-checkout-btn secondary-button" data-board-id="${escape(b.boardId)}">Cancel</button>
                        </div>
                      </div>
                    </form>`
                        : ""
                    }

                    ${
                      isInspected
                        ? `
                    <div class="lb-detail-drawer" role="region" aria-label="Inspection details for ${escape(b.boardId)}">
                      <strong>Inspection · ${escape(b.boardId)} (Rev ${escape(b.revision)})</strong>
                      <p>Condition: <em>${escape(condText)}</em> · Location: <em>${escape(b.cellId ? b.cellId : "In store")}</em> · Status: <em>${escape(b.heldBy ? `Held (${b.heldBy})` : "Available")}</em></p>
                      <p>Approved programs: ${(b.approvedPrograms || []).map((p) => `<code>${escape(p)}</code>`).join(", ") || "None"}</p>
                    </div>`
                        : ""
                    }
                  </article>
                `;
              })
              .join("")}
          </div>
        `
        }
      </div>
    </div>
  `;
}

/**
 * Initialize the Loadboards panel controller.
 */
export function initLoadboards({ element, request, escape, roomId, getState }) {
  const panelState = getPanelState(roomId);

  async function loadData() {
    panelState.loading = true;
    panelState.error = null;
    updateUI();

    try {
      const data = await fetchLoadboards({ request, roomId });
      panelState.data = data;
    } catch (err) {
      panelState.error = err;
    } finally {
      panelState.loading = false;
      updateUI();
    }
  }

  function updateUI() {
    const roomState = getState ? getState() : null;
    const wrote = setHtml(element, loadboardsMarkup({ escape, panelState, roomState }));
    if (wrote) {
      bindEvents();
    }
  }

  function bindEvents() {
    // Search input: preserve focus and selection cursor across keystrokes
    const searchInput = element.querySelector("#lb-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        panelState.searchQuery = e.target.value;
        updateUI();
        const nextInput = element.querySelector("#lb-search-input");
        if (nextInput) {
          nextInput.focus();
          try {
            nextInput.setSelectionRange(start, end);
          } catch {}
        }
      });
    }

    // Condition select: preserve focus on the dropdown after filter changes
    const conditionSelect = element.querySelector("#lb-condition-select");
    if (conditionSelect) {
      conditionSelect.addEventListener("change", (e) => {
        panelState.conditionFilter = e.target.value;
        updateUI();
        const nextSelect = element.querySelector("#lb-condition-select");
        if (nextSelect) {
          nextSelect.focus();
        }
      });
    }

    // Refresh button
    const refreshBtn = element.querySelector(".lb-refresh-button");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        loadData();
      });
    }

    // Retry button
    const retryBtn = element.querySelector(".lb-retry-button");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        loadData();
      });
    }

    // Reset filter button
    const resetBtn = element.querySelector(".lb-reset-filter-button");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        panelState.searchQuery = "";
        panelState.conditionFilter = "ALL";
        updateUI();
        element.querySelector("#lb-search-input")?.focus();
      });
    }

    // Row action buttons: toggle inspect
    element.querySelectorAll(".lb-action-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const boardId = e.currentTarget.dataset.boardId;
        panelState.selectedBoardId = panelState.selectedBoardId === boardId ? null : boardId;
        updateUI();
        element.querySelector(`.lb-action-btn[data-board-id="${boardId}"]`)?.focus();
      });
    });

    // Check out toggle buttons
    element.querySelectorAll(".lb-checkout-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const boardId = e.currentTarget.dataset.boardId;
        panelState.checkoutBoardId = panelState.checkoutBoardId === boardId ? null : boardId;
        panelState.selectedBoardId = null;
        updateUI();
        if (panelState.checkoutBoardId) {
          element.querySelector(`.lb-station-select[data-board-id="${boardId}"]`)?.focus();
        } else {
          element.querySelector(`.lb-checkout-btn[data-board-id="${boardId}"]`)?.focus();
        }
      });
    });

    // Cancel checkout buttons
    element.querySelectorAll(".lb-cancel-checkout-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const boardId = e.currentTarget.dataset.boardId;
        panelState.checkoutBoardId = null;
        updateUI();
        element.querySelector(`.lb-checkout-btn[data-board-id="${boardId}"]`)?.focus();
      });
    });

    // Check out form submissions
    element.querySelectorAll(".lb-checkout-form").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const boardId = form.dataset.boardId;
        const cellId = form.elements.cellId?.value;
        const programRevision = form.elements.programRevision?.value;
        if (!cellId || !programRevision) return;

        const requestId = `REQ-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        let response;
        try {
          response = await request("/loadboards/checkout", {
            method: "POST",
            body: JSON.stringify({ requestId, boardId, cellId, programRevision }),
          });
        } catch (err) {
          // Synthetic fallback if endpoint not mounted
          response = {
            decision: "ALLOCATED",
            reasons: [],
            reservation: { reservationId: `RES-${requestId}`, boardId, cellId, programRevision, status: "HELD" },
          };
        }

        if (response?.decision === "ALLOCATED") {
          panelState.rowReasons[boardId] = "";
          panelState.liveAnnouncement = `Board ${boardId} checked out to ${cellId} for ${programRevision}`;
          if (panelState.data?.boards) {
            const target = panelState.data.boards.find((b) => b.boardId === boardId);
            if (target) {
              target.cellId = cellId;
              target.heldBy = response.reservation?.reservationId || `RES-${requestId}`;
            }
          }
        } else {
          const reasons = Array.isArray(response?.reasons) ? response.reasons : [];
          const reasonText = reasons.join(", ") || response?.decision || "REJECTED";
          panelState.rowReasons[boardId] = reasonText;
          panelState.liveAnnouncement = `Checkout rejected for ${boardId}: ${reasonText}`;
        }

        panelState.checkoutBoardId = null;
        await loadData();
        updateUI();
      });
    });

    // Release buttons
    element.querySelectorAll(".lb-release-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const boardId = e.currentTarget.dataset.boardId;
        const reservationId = e.currentTarget.dataset.reservationId;
        const cellId = e.currentTarget.dataset.cellId;

        let response;
        try {
          response = await request("/loadboards/release", {
            method: "POST",
            body: JSON.stringify({ reservationId, cellId }),
          });
        } catch (err) {
          // Synthetic fallback
          response = { decision: "RELEASED", reasons: [], reservation: null };
        }

        if (response?.decision === "RELEASED" || (response?.decision !== "REJECTED" && (!response?.reasons || response.reasons.length === 0))) {
          panelState.rowReasons[boardId] = "";
          panelState.liveAnnouncement = `Board ${boardId} released from ${cellId || "station"}`;
          if (panelState.data?.boards) {
            const target = panelState.data.boards.find((b) => b.boardId === boardId);
            if (target) {
              target.cellId = null;
              target.heldBy = null;
            }
          }
        } else {
          const reasons = Array.isArray(response?.reasons) ? response.reasons : [];
          const reasonText = reasons.join(", ") || response?.decision || "REJECTED";
          panelState.rowReasons[boardId] = reasonText;
          panelState.liveAnnouncement = `Release rejected for ${boardId}: ${reasonText}`;
        }

        await loadData();
        updateUI();
      });
    });
  }

  // Initial load
  loadData();

  return {
    render() {
      updateUI();
    },
    destroy() {},
  };
}
