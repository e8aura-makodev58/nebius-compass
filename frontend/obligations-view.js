import { setHtml } from "./render-lifecycle.js";

/**
 * Consumable life obligations panel (F1 slice 2 UI).
 * Spec: docs/design/consumable-life-slice-2.md section 5
 * Contract: GET /api/control-rooms/:roomId/consumable-obligations
 *   → { roomId, asOf, obligations: [{ obligationId, kind, status, lifecycleId, policyId, policyVersion, openedAt, closedAt, closeReason, supersededBy }] }
 */

// Per-viewer in-memory state
const stateByRoom = new Map();

export function getPanelState(roomId) {
  if (!stateByRoom.has(roomId)) {
    stateByRoom.set(roomId, {
      searchQuery: "",
      statusFilter: "ALL", // ALL | OPEN | CLOSED
      selectedObligationId: null,
      data: null,
      loading: false,
      error: null,
    });
  }
  return stateByRoom.get(roomId);
}

/**
 * Synthetic fallback consumable obligations inventory when the endpoint is unmounted (404) or running offline.
 */
export function generateSyntheticObligations(roomId) {
  return {
    roomId: roomId || "plant-1",
    asOf: new Date().toISOString(),
    obligations: [
      {
        obligationId: "OBL-LC-ATE1-PRB01-CLEANING",
        kind: "CLEANING",
        status: "OPEN",
        lifecycleId: "LC-ATE1-PRB01",
        policyId: "probe-card-clean",
        policyVersion: "v1",
        openedAt: "2026-10-24T08:00:00.000Z",
        closedAt: null,
        closeReason: null,
        supersededBy: null,
      },
      {
        obligationId: "OBL-LC-ATE2-SOC03-REPLACEMENT",
        kind: "REPLACEMENT",
        status: "OPEN",
        lifecycleId: "LC-ATE2-SOC03",
        policyId: "socket-life",
        policyVersion: "v2",
        openedAt: "2026-10-24T09:30:00.000Z",
        closedAt: null,
        closeReason: null,
        supersededBy: null,
      },
      {
        obligationId: "OBL-LC-ATE1-PRB00-CLEANING",
        kind: "CLEANING",
        status: "CLOSED",
        lifecycleId: "LC-ATE1-PRB00",
        policyId: "probe-card-clean",
        policyVersion: "v1",
        openedAt: "2026-10-23T14:00:00.000Z",
        closedAt: "2026-10-24T02:00:00.000Z",
        closeReason: "CLEANED",
        supersededBy: null,
      },
      {
        obligationId: "OBL-LC-ATE3-CON01-RECONCILIATION",
        kind: "RECONCILIATION",
        status: "CLOSED",
        lifecycleId: "LC-ATE3-CON01",
        policyId: "contactor-wear",
        policyVersion: "v1",
        openedAt: "2026-10-23T10:00:00.000Z",
        closedAt: "2026-10-23T16:00:00.000Z",
        closeReason: "SUPERSEDED",
        supersededBy: "OBL-LC-ATE3-CON01-REPLACEMENT",
      },
    ],
  };
}

/**
 * Fetch obligations for the specified control room.
 */
export async function fetchObligations({ request, roomId, getState }) {
  // If room state already exposes consumableObligations array directly, prefer it
  const roomState = getState?.();
  if (Array.isArray(roomState?.consumableObligations) && roomState.consumableObligations.length > 0) {
    return {
      roomId,
      asOf: roomState.simulationState?.simulationTime || new Date().toISOString(),
      obligations: roomState.consumableObligations,
    };
  }

  try {
    const data = await request("/consumable-obligations");
    return data;
  } catch (err) {
    if (err && (err.status === 404 || String(err.message).includes("404") || String(err.message).includes("Cannot GET") || String(err.message).includes("Not Found"))) {
      return generateSyntheticObligations(roomId);
    }
    throw err;
  }
}

function formatIsoTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const min = String(d.getUTCMinutes()).padStart(2, "0");
    return `${m}-${day} ${h}:${min} UTC`;
  } catch {
    return String(iso);
  }
}

function kindBadgeClass(kind) {
  switch (kind) {
    case "CLEANING":
      return "obl-badge-cleaning";
    case "REPLACEMENT":
      return "obl-badge-replacement";
    case "RECONCILIATION":
      return "obl-badge-reconciliation";
    default:
      return "";
  }
}

function statusBadgeClass(status) {
  switch (status) {
    case "OPEN":
      return "obl-status-open";
    case "CLOSED":
      return "obl-status-closed";
    default:
      return "";
  }
}

/**
 * Render Obligations markup.
 */
export function obligationsMarkup({ escape, panelState }) {
  const { data, loading, error, searchQuery, statusFilter, selectedObligationId } = panelState;
  const allObligations = data?.obligations ?? [];

  // Filter obligations
  const query = (searchQuery || "").trim().toLowerCase();
  const filteredObligations = allObligations.filter((obl) => {
    if (statusFilter !== "ALL" && obl.status !== statusFilter) {
      return false;
    }
    if (!query) return true;
    const matchId = String(obl.obligationId || "").toLowerCase().includes(query);
    const matchKind = String(obl.kind || "").toLowerCase().includes(query);
    const matchLc = String(obl.lifecycleId || "").toLowerCase().includes(query);
    const policyString = `${obl.policyId || ""}@${obl.policyVersion || ""}`.toLowerCase();
    const matchPolicy = policyString.includes(query);
    const matchReason = String(obl.closeReason || "").toLowerCase().includes(query);
    return matchId || matchKind || matchLc || matchPolicy || matchReason;
  });

  const totalCount = allObligations.length;
  const matchCount = filteredObligations.length;
  const openCount = allObligations.filter((o) => o.status === "OPEN").length;
  const countLabel = query || statusFilter !== "ALL"
    ? `${matchCount} of ${totalCount} obligation${totalCount === 1 ? "" : "s"}`
    : `${openCount} open · ${totalCount} total`;

  return `
    <div class="obligations-panel">
      <header class="obl-header">
        <div>
          <p class="eyebrow">Consumable Life</p>
          <h3 id="obligations-heading">Obligations</h3>
        </div>
        <div class="obl-header-badges">
          <span class="obl-count-badge" data-obl-count="${matchCount}">${escape(countLabel)}</span>
        </div>
      </header>

      <div class="obl-toolbar" role="region" aria-label="Obligation filters">
        <div class="obl-search-wrap">
          <input
            type="search"
            class="obl-search-input"
            id="obl-search-input"
            placeholder="Search obligations…"
            value="${escape(searchQuery)}"
            aria-label="Search obligations by ID, kind, lifecycle, or policy"
          />
        </div>

        <div class="obl-controls-wrap">
          <label class="obl-filter-label" for="obl-status-select">
            Status
            <select class="obl-status-select" id="obl-status-select" aria-label="Filter by obligation status">
              <option value="ALL" ${statusFilter === "ALL" ? "selected" : ""}>All</option>
              <option value="OPEN" ${statusFilter === "OPEN" ? "selected" : ""}>Open</option>
              <option value="CLOSED" ${statusFilter === "CLOSED" ? "selected" : ""}>Closed</option>
            </select>
          </label>

          <button type="button" class="obl-refresh-button secondary-button" aria-label="Refresh obligations">
            Refresh
          </button>
        </div>
      </div>

      <div class="obl-content">
        ${
          loading
            ? `
          <div class="obl-state obl-loading" role="status">
            <span class="activity-spinner"></span>
            <span>Loading obligations…</span>
          </div>`
            : error
            ? `
          <div class="obl-state obl-error obl-error-state" role="alert">
            <p class="load-error">Failed to load consumable obligations: ${escape(error.message || "Unknown error")}</p>
            <button type="button" class="obl-retry-button secondary-button">Retry</button>
          </div>`
            : filteredObligations.length === 0
            ? `
          <div class="obl-state obl-empty obl-empty-state">
            <p class="workflow-prompt">No obligations match the current search or filter.</p>
            <button type="button" class="obl-reset-filter-button secondary-button">Reset filters</button>
          </div>`
            : `
          <!-- Desktop table layout (>= 901px) -->
          <div class="obl-table-container">
            <table class="obl-table" aria-label="Consumable obligations table">
              <thead>
                <tr>
                  <th scope="col">Obligation ID</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Status</th>
                  <th scope="col">Lifecycle ID</th>
                  <th scope="col">Policy</th>
                  <th scope="col">Opened</th>
                  <th scope="col">Close Reason</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                ${filteredObligations
                  .map((o) => {
                    const kindCls = kindBadgeClass(o.kind);
                    const statusCls = statusBadgeClass(o.status);
                    const policyDisplay = `${o.policyId}@${o.policyVersion}`;
                    const reasonDisplay = o.status === "CLOSED" && o.closeReason ? escape(o.closeReason) : "—";
                    const isInspected = selectedObligationId === o.obligationId;

                    return `
                      <tr data-obligation-id="${escape(o.obligationId)}" class="${isInspected ? "obl-row-inspected" : ""}">
                        <td class="obl-cell-id"><strong>${escape(o.obligationId)}</strong></td>
                        <td class="obl-cell-kind"><span class="obl-badge ${kindCls}">${escape(o.kind)}</span></td>
                        <td class="obl-cell-status"><span class="obl-status-badge ${statusCls}">${escape(o.status)}</span></td>
                        <td class="obl-cell-lifecycle">${escape(o.lifecycleId)}</td>
                        <td class="obl-cell-policy"><span class="obl-policy-tag">${escape(policyDisplay)}</span></td>
                        <td class="obl-cell-opened">${formatIsoTime(o.openedAt)}</td>
                        <td class="obl-cell-reason">${reasonDisplay}</td>
                        <td class="obl-cell-actions">
                          <button
                            type="button"
                            class="obl-action-btn secondary-button"
                            data-obligation-id="${escape(o.obligationId)}"
                            aria-expanded="${isInspected ? "true" : "false"}"
                            aria-label="Inspect obligation ${escape(o.obligationId)}"
                          >
                            ${isInspected ? "Close" : "Inspect"}
                          </button>
                        </td>
                      </tr>
                      ${
                        isInspected
                          ? `
                      <tr class="obl-row-detail-wrap" data-detail-for="${escape(o.obligationId)}">
                        <td colspan="8">
                          <div class="obl-detail-drawer" role="region" aria-label="Inspection details for ${escape(o.obligationId)}">
                            <strong>${escape(o.obligationId)} · ${escape(o.kind)}</strong>
                            <p>Lifecycle: <code>${escape(o.lifecycleId)}</code> · Policy: <code>${escape(policyDisplay)}</code> · Status: <em>${escape(o.status)}</em></p>
                            <p>Opened: <em>${escape(o.openedAt || "—")}</em> · Closed: <em>${escape(o.closedAt || "—")}</em> · Reason: <em>${escape(o.closeReason || "None (Open)")}</em></p>
                            ${o.supersededBy ? `<p>Superseded by: <code>${escape(o.supersededBy)}</code></p>` : ""}
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

          <!-- Mobile cards layout (<= 900px) -->
          <div class="obl-cards-container" role="list" aria-label="Consumable obligations list">
            ${filteredObligations
              .map((o) => {
                const kindCls = kindBadgeClass(o.kind);
                const statusCls = statusBadgeClass(o.status);
                const policyDisplay = `${o.policyId}@${o.policyVersion}`;
                const reasonDisplay = o.status === "CLOSED" && o.closeReason ? escape(o.closeReason) : "—";
                const isInspected = selectedObligationId === o.obligationId;

                return `
                  <article class="obl-card" role="listitem" data-obligation-id="${escape(o.obligationId)}">
                    <div class="obl-card-top">
                      <div class="obl-card-title">
                        <strong class="obl-id">${escape(o.obligationId)}</strong>
                      </div>
                      <div class="obl-card-badges">
                        <span class="obl-badge ${kindCls}">${escape(o.kind)}</span>
                        <span class="obl-status-badge ${statusCls}">${escape(o.status)}</span>
                      </div>
                    </div>

                    <div class="obl-card-grid">
                      <div class="obl-card-row">
                        <span class="obl-card-key">Lifecycle:</span>
                        <span class="obl-card-val">${escape(o.lifecycleId)}</span>
                      </div>
                      <div class="obl-card-row">
                        <span class="obl-card-key">Policy:</span>
                        <span class="obl-card-val">${escape(policyDisplay)}</span>
                      </div>
                      <div class="obl-card-row">
                        <span class="obl-card-key">Opened:</span>
                        <span class="obl-card-val">${formatIsoTime(o.openedAt)}</span>
                      </div>
                      <div class="obl-card-row">
                        <span class="obl-card-key">Close Reason:</span>
                        <span class="obl-card-val">${reasonDisplay}</span>
                      </div>
                    </div>

                    <div class="obl-card-actions">
                      <button
                        type="button"
                        class="obl-action-btn secondary-button"
                        data-obligation-id="${escape(o.obligationId)}"
                        aria-expanded="${isInspected ? "true" : "false"}"
                        aria-label="Inspect obligation ${escape(o.obligationId)}"
                      >
                        ${isInspected ? "Close inspection" : "Inspect"}
                      </button>
                    </div>

                    ${
                      isInspected
                        ? `
                    <div class="obl-detail-drawer" role="region" aria-label="Inspection details for ${escape(o.obligationId)}">
                      <strong>${escape(o.obligationId)} · ${escape(o.kind)}</strong>
                      <p>Lifecycle: <code>${escape(o.lifecycleId)}</code> · Policy: <code>${escape(policyDisplay)}</code></p>
                      <p>Opened: <em>${escape(o.openedAt || "—")}</em> · Closed: <em>${escape(o.closedAt || "—")}</em></p>
                      <p>Close reason: <em>${escape(o.closeReason || "None (Open)")}</em></p>
                      ${o.supersededBy ? `<p>Superseded by: <code>${escape(o.supersededBy)}</code></p>` : ""}
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
 * Initialize Obligations panel on the container element.
 */
export function initObligations({ element, request, escape, roomId, getState }) {
  const panelState = getPanelState(roomId);

  async function loadData() {
    panelState.loading = true;
    panelState.error = null;
    updateUI();

    try {
      const data = await fetchObligations({ request, roomId, getState });
      panelState.data = data;
    } catch (err) {
      panelState.error = err;
    } finally {
      panelState.loading = false;
      updateUI();
    }
  }

  function updateUI() {
    const html = obligationsMarkup({ escape, panelState });
    const wrote = setHtml(element, html);
    if (wrote) {
      bindEvents();
    }
  }

  function bindEvents() {
    // Search input: preserve focus and selection cursor across keystrokes
    const searchInput = element.querySelector("#obl-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        panelState.searchQuery = e.target.value;
        updateUI();
        const nextInput = element.querySelector("#obl-search-input");
        if (nextInput) {
          nextInput.focus();
          try {
            nextInput.setSelectionRange(start, end);
          } catch {}
        }
      });
    }

    // Status select: preserve focus on the dropdown after filter changes
    const statusSelect = element.querySelector("#obl-status-select");
    if (statusSelect) {
      statusSelect.addEventListener("change", (e) => {
        panelState.statusFilter = e.target.value;
        updateUI();
        const nextSelect = element.querySelector("#obl-status-select");
        if (nextSelect) {
          nextSelect.focus();
        }
      });
    }

    // Refresh button
    const refreshBtn = element.querySelector(".obl-refresh-button");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        loadData();
      });
    }

    // Retry button
    const retryBtn = element.querySelector(".obl-retry-button");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        loadData();
      });
    }

    // Reset filter button
    const resetBtn = element.querySelector(".obl-reset-filter-button");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        panelState.searchQuery = "";
        panelState.statusFilter = "ALL";
        updateUI();
        element.querySelector("#obl-search-input")?.focus();
      });
    }

    // Row action buttons: toggle inspect
    element.querySelectorAll(".obl-action-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const obligationId = e.currentTarget.dataset.obligationId;
        panelState.selectedObligationId = panelState.selectedObligationId === obligationId ? null : obligationId;
        updateUI();
        element.querySelector(`.obl-action-btn[data-obligation-id="${obligationId}"]`)?.focus();
      });
    });

    // Inspect detail drawer keyboard Escape
    element.querySelectorAll(".obl-detail-drawer").forEach((drawer) => {
      drawer.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          const obligationId = panelState.selectedObligationId;
          panelState.selectedObligationId = null;
          updateUI();
          if (obligationId) {
            element.querySelector(`.obl-action-btn[data-obligation-id="${obligationId}"]`)?.focus();
          }
        }
      });
    });
  }

  // Initial load
  loadData();

  return {
    render() {
      // Re-render when external room state updates (e.g. simulation tick reconciles obligations)
      const roomState = getState?.();
      if (Array.isArray(roomState?.consumableObligations) && roomState.consumableObligations.length > 0) {
        panelState.data = {
          roomId,
          asOf: roomState.simulationState?.simulationTime || new Date().toISOString(),
          obligations: roomState.consumableObligations,
        };
      }
      updateUI();
    },
    destroy() {},
  };
}
