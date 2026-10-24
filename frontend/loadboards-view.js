import { setHtml } from "./render-lifecycle.js";

/**
 * Loadboard inventory and checkout panel (F3 UI).
 * Spec: docs/design/loadboard-checkout-slice-1.md
 * Contract: GET /api/control-rooms/:roomId/loadboards
 *   → { roomId, asOf, boards: [{ boardId, revision, condition, cellId, approvedPrograms, heldBy }] }
 */

// Per-viewer in-memory state
const stateByRoom = new Map();

export function getPanelState(roomId) {
  if (!stateByRoom.has(roomId)) {
    stateByRoom.set(roomId, {
      searchQuery: "",
      conditionFilter: "ALL", // ALL | SERVICEABLE | UNDER_REPAIR | QUARANTINED
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
export function loadboardsMarkup({ escape, panelState }) {
  const { data, loading, error, searchQuery, conditionFilter } = panelState;
  const allBoards = data?.boards ?? [];

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
                </tr>
              </thead>
              <tbody>
                ${filteredBoards
                  .map((b) => {
                    const badgeCls = conditionBadgeClass(b.condition);
                    const condText = conditionLabel(b.condition);
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

                    return `
                      <tr data-board-id="${escape(b.boardId)}">
                        <td class="lb-cell-id"><strong>${escape(b.boardId)}</strong></td>
                        <td class="lb-cell-rev">${escape(b.revision)}</td>
                        <td class="lb-cell-condition">
                          <span class="lb-badge ${badgeCls}">${escape(condText)}</span>
                        </td>
                        <td class="lb-cell-location">${locationHtml}</td>
                        <td class="lb-cell-programs">${programsHtml}</td>
                        <td class="lb-cell-held">${heldHtml}</td>
                      </tr>
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
 * Initialize Loadboard inventory panel on the given container element.
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
    const html = loadboardsMarkup({ escape, panelState });
    setHtml(element, html);
    bindEvents();
  }

  function bindEvents() {
    // Search input
    const searchInput = element.querySelector("#lb-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        panelState.searchQuery = e.target.value;
        updateUI();
      });
    }

    // Condition select
    const conditionSelect = element.querySelector("#lb-condition-select");
    if (conditionSelect) {
      conditionSelect.addEventListener("change", (e) => {
        panelState.conditionFilter = e.target.value;
        updateUI();
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
      });
    }
  }

  // Initial load
  loadData();

  return {
    render() {
      // Re-render if necessary
      updateUI();
    },
    destroy() {},
  };
}
