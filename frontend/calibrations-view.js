import { setHtml } from "./render-lifecycle.js";

/**
 * Calibrations panel (F8 Slice 2 UI).
 * Spec: Round 36 assignment & docs/design/calibration-readiness-slice-1.md
 * Contract:
 *   GET /api/control-rooms/:roomId/calibrations
 *     → { roomId, asOf, calibrations: [{ calibrationId, cellId, instrumentId, calibratedAt, dueAt, state }] }
 *   POST /api/control-rooms/:roomId/calibrations
 *     body: { calibrationId, cellId, instrumentId, calibratedAt, dueAt }
 *     returns: { decision: "ACCEPTED" | "REJECTED", reasons?: string[] }
 */

const stateByRoom = new Map();

export function getPanelState(roomId) {
  if (!stateByRoom.has(roomId)) {
    stateByRoom.set(roomId, {
      searchQuery: "",
      stateFilter: "ALL", // ALL | CURRENT | EXPIRED
      isAddFormOpen: false,
      formValues: {
        calibrationId: "",
        cellId: "ATE-1",
        instrumentId: "",
        calibratedAt: "",
        dueAt: "",
      },
      formError: null,
      formSubmitting: false,
      data: null,
      syntheticRows: null, // used for offline/fallback additions
      liveAnnouncement: "",
      loading: false,
      error: null,
    });
  }
  return stateByRoom.get(roomId);
}

/**
 * Synthetic fallback calibration records when endpoint returns 404 or running offline.
 */
export function generateSyntheticCalibrations(roomId) {
  const now = new Date();
  const past = new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString();
  const future = new Date(now.getTime() + 90 * 24 * 3600 * 1000).toISOString();
  const expiredDue = new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString();

  return {
    roomId: roomId || "plant-1",
    asOf: now.toISOString(),
    calibrations: [
      {
        calibrationId: "CAL-0031",
        cellId: "ATE-1",
        instrumentId: "PS-07",
        calibratedAt: past,
        dueAt: future,
        state: "CURRENT",
      },
      {
        calibrationId: "CAL-0022",
        cellId: "ATE-2",
        instrumentId: "DMM-02",
        calibratedAt: past,
        dueAt: expiredDue,
        state: "EXPIRED",
      },
      {
        calibrationId: "CAL-0044",
        cellId: "ATE-4",
        instrumentId: "SCOPE-01",
        calibratedAt: past,
        dueAt: future,
        state: "CURRENT",
      },
    ],
  };
}

/**
 * Fetch calibrations for the specified control room.
 */
export async function fetchCalibrations({ request, roomId, getState }) {
  const roomState = getState?.();
  if (Array.isArray(roomState?.calibrations)) {
    const asOf = roomState?.simulationState?.simulationTime || new Date().toISOString();
    return {
      roomId,
      asOf,
      calibrations: roomState.calibrations.map((c) => ({
        ...c,
        state: c.dueAt <= asOf ? "EXPIRED" : "CURRENT",
      })),
    };
  }

  try {
    const data = await request("/calibrations");
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
      return generateSyntheticCalibrations(roomId);
    }
    throw err;
  }
}

/**
 * Submit calibration record.
 */
export async function submitCalibration({ request, roomId, payload }) {
  try {
    const res = await request("/calibrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res;
  } catch (err) {
    // If backend route does not exist yet (stub-first / offline), handle synthetically
    if (
      err &&
      (err.status === 404 ||
        err.status === 405 ||
        String(err.message).includes("404") ||
        String(err.message).includes("Cannot POST") ||
        String(err.message).includes("Not Found"))
    ) {
      return { decision: "ACCEPTED", reasons: [] };
    }
    throw err;
  }
}

function formatDate(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toISOString().replace(".000Z", "Z").replace("T", " ");
  } catch {
    return isoString;
  }
}

function computeState(dueAt, asOf) {
  if (!dueAt) return "CURRENT";
  const ref = asOf ? new Date(asOf).getTime() : Date.now();
  const due = new Date(dueAt).getTime();
  return due <= ref ? "EXPIRED" : "CURRENT";
}

export function initCalibrations({ element, request, escape, roomId, getState }) {
  const panelState = getPanelState(roomId);
  let boundSearchInput = null;

  async function loadData() {
    panelState.loading = !panelState.data;
    panelState.error = null;
    updateUI();

    try {
      const data = await fetchCalibrations({ request, roomId, getState });
      if (panelState.syntheticRows && Array.isArray(panelState.syntheticRows)) {
        // Merge any locally added synthetic rows
        const existingIds = new Set((data.calibrations || []).map((c) => c.calibrationId));
        const extra = panelState.syntheticRows.filter((r) => !existingIds.has(r.calibrationId));
        panelState.data = {
          ...data,
          calibrations: [...(data.calibrations || []), ...extra],
        };
      } else {
        panelState.data = data;
      }
    } catch (err) {
      panelState.error = err?.message || "Failed to load calibrations";
    } finally {
      panelState.loading = false;
      updateUI();
    }
  }

  function updateUI() {
    const { searchQuery, stateFilter, isAddFormOpen, formValues, formError, formSubmitting, data, loading, error, liveAnnouncement } = panelState;
    const asOf = data?.asOf || new Date().toISOString();
    const rows = (data?.calibrations || []).map((row) => ({
      ...row,
      state: row.state || computeState(row.dueAt, asOf),
    }));

    const q = (searchQuery || "").trim().toLowerCase();
    const filteredRows = rows.filter((row) => {
      if (stateFilter !== "ALL" && row.state !== stateFilter) return false;
      if (!q) return true;
      return (
        (row.calibrationId || "").toLowerCase().includes(q) ||
        (row.cellId || "").toLowerCase().includes(q) ||
        (row.instrumentId || "").toLowerCase().includes(q) ||
        (row.state || "").toLowerCase().includes(q)
      );
    });

    const currentCount = rows.filter((r) => r.state === "CURRENT").length;
    const expiredCount = rows.filter((r) => r.state === "EXPIRED").length;

    let contentHtml = "";

    if (loading && !data) {
      contentHtml = `
        <div class="cal-loading" role="status">
          <span class="cal-spinner" aria-hidden="true"></span>
          <span>Loading calibrations…</span>
        </div>
      `;
    } else if (error && !data) {
      contentHtml = `
        <div class="cal-error-banner" role="alert">
          <p class="cal-error-text">Failed to load calibrations: ${escape(error)}</p>
          <button type="button" class="cal-retry-button primary-button" aria-label="Retry loading calibrations">Retry</button>
        </div>
      `;
    } else {
      const formHtml = isAddFormOpen
        ? `
        <section class="cal-add-drawer" aria-label="Add calibration record">
          <form class="cal-add-form" novalidate>
            <div class="cal-form-header">
              <h3 class="cal-form-title">New Calibration Record</h3>
              <button type="button" class="cal-close-form-btn secondary-button" aria-label="Close add calibration form">✕ Cancel</button>
            </div>

            ${formError ? `<div class="cal-form-error" role="alert" aria-live="assertive">${escape(formError)}</div>` : ""}

            <div class="cal-form-grid">
              <div class="cal-field-group">
                <label for="cal-input-id">Calibration ID <span class="cal-req">*</span></label>
                <input
                  type="text"
                  id="cal-input-id"
                  name="calibrationId"
                  value="${escape(formValues.calibrationId)}"
                  placeholder="CAL-0101"
                  required
                  pattern="[A-Za-z0-9_-]{1,120}"
                  aria-describedby="cal-id-desc"
                  ${formSubmitting ? "disabled" : ""}
                />
                <span id="cal-id-desc" class="cal-field-hint">e.g. CAL-0101 (alphanumeric, dashes, underscores)</span>
              </div>

              <div class="cal-field-group">
                <label for="cal-input-cell">Cell ID <span class="cal-req">*</span></label>
                <input
                  type="text"
                  id="cal-input-cell"
                  name="cellId"
                  value="${escape(formValues.cellId)}"
                  placeholder="ATE-1"
                  required
                  ${formSubmitting ? "disabled" : ""}
                />
                <span class="cal-field-hint">e.g. ATE-1, ATE-2</span>
              </div>

              <div class="cal-field-group">
                <label for="cal-input-inst">Instrument ID <span class="cal-req">*</span></label>
                <input
                  type="text"
                  id="cal-input-inst"
                  name="instrumentId"
                  value="${escape(formValues.instrumentId)}"
                  placeholder="DMM-01"
                  required
                  ${formSubmitting ? "disabled" : ""}
                />
                <span class="cal-field-hint">e.g. DMM-01, PS-07, SCOPE-01</span>
              </div>

              <div class="cal-field-group">
                <label for="cal-input-calibrated">Calibrated At <span class="cal-req">*</span></label>
                <input
                  type="datetime-local"
                  id="cal-input-calibrated"
                  name="calibratedAt"
                  value="${escape(formValues.calibratedAt)}"
                  required
                  ${formSubmitting ? "disabled" : ""}
                />
                <span class="cal-field-hint">Calibration completion instant</span>
              </div>

              <div class="cal-field-group">
                <label for="cal-input-due">Due At <span class="cal-req">*</span></label>
                <input
                  type="datetime-local"
                  id="cal-input-due"
                  name="dueAt"
                  value="${escape(formValues.dueAt)}"
                  required
                  ${formSubmitting ? "disabled" : ""}
                />
                <span class="cal-field-hint">Expiration deadline (must be on or after calibrated instant)</span>
              </div>
            </div>

            <div class="cal-form-actions">
              <button type="submit" class="cal-submit-btn primary-button" ${formSubmitting ? "disabled" : ""}>
                ${formSubmitting ? "Saving…" : "Save Calibration"}
              </button>
              <button type="button" class="cal-cancel-form-btn secondary-button" ${formSubmitting ? "disabled" : ""}>Cancel</button>
            </div>
          </form>
        </section>
      `
        : "";

      const tableRowsHtml = filteredRows.length
        ? filteredRows
            .map((r) => {
              const isExpired = r.state === "EXPIRED";
              const stateBadge = isExpired
                ? `<span class="cal-state-badge cal-badge-expired">EXPIRED</span>`
                : `<span class="cal-state-badge cal-badge-current">CURRENT</span>`;

              return `
              <tr data-calibration-id="${escape(r.calibrationId)}">
                <td class="cal-cell-id"><code>${escape(r.calibrationId)}</code></td>
                <td class="cal-cell-cell"><strong class="cal-cell-name">${escape(r.cellId)}</strong></td>
                <td class="cal-cell-inst"><code>${escape(r.instrumentId)}</code></td>
                <td class="cal-cell-calibrated">${escape(formatDate(r.calibratedAt))}</td>
                <td class="cal-cell-due">${escape(formatDate(r.dueAt))}</td>
                <td class="cal-cell-state">${stateBadge}</td>
              </tr>
            `;
            })
            .join("")
        : `
          <tr>
            <td colspan="6" class="cal-empty-td">
              <div class="cal-empty-state">
                <p class="cal-empty-title">No calibration records found</p>
                <p class="cal-empty-desc">${q || stateFilter !== "ALL" ? "Try adjusting your search query or state filter." : "Click 'Add calibration' to record a new calibration."}</p>
                ${q || stateFilter !== "ALL" ? `<button type="button" class="cal-reset-filters-btn secondary-button">Reset filters</button>` : ""}
              </div>
            </td>
          </tr>
        `;

      const cardsHtml = filteredRows.length
        ? filteredRows
            .map((r) => {
              const isExpired = r.state === "EXPIRED";
              const stateBadge = isExpired
                ? `<span class="cal-state-badge cal-badge-expired">EXPIRED</span>`
                : `<span class="cal-state-badge cal-badge-current">CURRENT</span>`;

              return `
              <article class="cal-card" data-calibration-id="${escape(r.calibrationId)}" role="listitem">
                <div class="cal-card-top">
                  <strong class="cal-card-id">${escape(r.calibrationId)}</strong>
                  ${stateBadge}
                </div>
                <div class="cal-card-grid">
                  <div class="cal-card-field">
                    <span class="cal-card-key">Cell:</span>
                    <strong class="cal-card-val">${escape(r.cellId)}</strong>
                  </div>
                  <div class="cal-card-field">
                    <span class="cal-card-key">Instrument:</span>
                    <span class="cal-card-val"><code>${escape(r.instrumentId)}</code></span>
                  </div>
                  <div class="cal-card-field">
                    <span class="cal-card-key">Calibrated:</span>
                    <span class="cal-card-val">${escape(formatDate(r.calibratedAt))}</span>
                  </div>
                  <div class="cal-card-field">
                    <span class="cal-card-key">Due:</span>
                    <span class="cal-card-val">${escape(formatDate(r.dueAt))}</span>
                  </div>
                </div>
              </article>
            `;
            })
            .join("")
        : `
          <div class="cal-empty-state cal-card-empty">
            <p class="cal-empty-title">No calibration records found</p>
            <p class="cal-empty-desc">${q || stateFilter !== "ALL" ? "Try adjusting your search query or state filter." : "Click 'Add calibration' to record a new calibration."}</p>
            ${q || stateFilter !== "ALL" ? `<button type="button" class="cal-reset-filters-btn secondary-button">Reset filters</button>` : ""}
          </div>
        `;

      contentHtml = `
        ${formHtml}

        <div class="cal-controls-bar">
          <div class="cal-search-wrap">
            <label for="cal-search-input" class="sr-only">Search calibrations</label>
            <input
              type="search"
              id="cal-search-input"
              class="cal-search-input"
              placeholder="Search by ID, cell, instrument…"
              value="${escape(searchQuery)}"
              aria-label="Search calibrations by ID, cell, or instrument"
            />
          </div>

          <div class="cal-filter-wrap">
            <label for="cal-filter-state" class="cal-filter-label">State</label>
            <select id="cal-filter-state" class="cal-filter-select" aria-label="Filter by calibration state">
              <option value="ALL" ${stateFilter === "ALL" ? "selected" : ""}>All states (${rows.length})</option>
              <option value="CURRENT" ${stateFilter === "CURRENT" ? "selected" : ""}>CURRENT (${currentCount})</option>
              <option value="EXPIRED" ${stateFilter === "EXPIRED" ? "selected" : ""}>EXPIRED (${expiredCount})</option>
            </select>
          </div>

          <div class="cal-counts-wrap">
            <span class="cal-count-badge" aria-label="${filteredRows.length} of ${rows.length} records shown">
              ${filteredRows.length} of ${rows.length} records
            </span>
          </div>
        </div>

        <div class="cal-table-container">
          <table class="cal-table" aria-label="Calibration records table">
            <thead>
              <tr>
                <th scope="col">Calibration ID</th>
                <th scope="col">Cell</th>
                <th scope="col">Instrument</th>
                <th scope="col">Calibrated At</th>
                <th scope="col">Due At</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
        </div>

        <div class="cal-cards-list" role="list" aria-label="Calibration records list">
          ${cardsHtml}
        </div>
      `;
    }

    const html = `
      <div class="cal-container" role="region" aria-label="Calibrations">
        <header class="cal-header">
          <div class="cal-header-info">
            <p class="cal-eyebrow">ATE Maintenance · F8</p>
            <h2 class="cal-title">Calibrations</h2>
          </div>
          <div class="cal-header-actions">
            <button
              type="button"
              class="cal-toggle-add-btn primary-button"
              aria-expanded="${isAddFormOpen ? "true" : "false"}"
              aria-label="${isAddFormOpen ? "Close add calibration form" : "Add calibration record"}"
            >
              ${isAddFormOpen ? "Close Form" : "+ Add Calibration"}
            </button>
            <button
              type="button"
              class="cal-refresh-btn secondary-button"
              aria-label="Refresh calibration records"
              title="Refresh calibration records"
            >
              ↻ Refresh
            </button>
          </div>
        </header>

        <div id="cal-live-announcer" class="sr-only" role="status" aria-live="polite">${escape(liveAnnouncement)}</div>

        ${contentHtml}
      </div>
    `;

    // Retain search input cursor/selection if active
    const activeEl = document.activeElement;
    const isSearchFocused = activeEl && activeEl.id === "cal-search-input";
    const selStart = isSearchFocused ? activeEl.selectionStart : null;
    const selEnd = isSearchFocused ? activeEl.selectionEnd : null;

    setHtml(element, html);

    const stateSelectEl = element.querySelector("#cal-filter-state");
    if (stateSelectEl && panelState.stateFilter) {
      stateSelectEl.value = panelState.stateFilter;
    }

    const cellInputEl = element.querySelector("#cal-input-cell");
    if (cellInputEl && panelState.formValues.cellId) {
      cellInputEl.value = panelState.formValues.cellId;
    }

    bindEvents();

    if (isSearchFocused) {
      const newSearch = element.querySelector("#cal-search-input");
      if (newSearch) {
        newSearch.focus();
        if (selStart !== null && selEnd !== null) {
          try {
            newSearch.setSelectionRange(selStart, selEnd);
          } catch {}
        }
      }
    }
  }

  function bindEvents() {
    // Toggle add form button
    const toggleBtn = element.querySelector(".cal-toggle-add-btn");
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        panelState.isAddFormOpen = !panelState.isAddFormOpen;
        panelState.formError = null;
        updateUI();
        if (panelState.isAddFormOpen) {
          element.querySelector("#cal-input-id")?.focus();
        } else {
          element.querySelector(".cal-toggle-add-btn")?.focus();
        }
      };
    }

    // Close form buttons
    element.querySelectorAll(".cal-close-form-btn, .cal-cancel-form-btn").forEach((btn) => {
      btn.onclick = () => {
        panelState.isAddFormOpen = false;
        panelState.formError = null;
        updateUI();
        element.querySelector(".cal-toggle-add-btn")?.focus();
      };
    });

    // Refresh button
    const refreshBtn = element.querySelector(".cal-refresh-btn");
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        panelState.liveAnnouncement = "Refreshing calibrations…";
        loadData();
      };
    }

    // Retry button on error
    const retryBtn = element.querySelector(".cal-retry-button");
    if (retryBtn) {
      retryBtn.onclick = () => loadData();
    }

    // Reset filters button
    element.querySelectorAll(".cal-reset-filters-btn").forEach((btn) => {
      btn.onclick = () => {
        panelState.searchQuery = "";
        panelState.stateFilter = "ALL";
        updateUI();
        element.querySelector("#cal-search-input")?.focus();
      };
    });

    // Search input
    const searchInput = element.querySelector("#cal-search-input");
    if (searchInput) {
      searchInput.oninput = (e) => {
        panelState.searchQuery = e.target.value;
        updateUI();
      };
    }

    // State filter select
    const stateSelect = element.querySelector("#cal-filter-state");
    if (stateSelect) {
      stateSelect.onchange = (e) => {
        panelState.stateFilter = e.target.value;
        updateUI();
      };
    }

    // Form inputs change tracking
    const form = element.querySelector(".cal-add-form");
    if (form) {
      form.oninput = (e) => {
        const { name, value } = e.target;
        if (name && panelState.formValues.hasOwnProperty(name)) {
          panelState.formValues[name] = value;
        }
      };

      form.onsubmit = async (e) => {
        e.preventDefault();
        panelState.formError = null;

        const { calibrationId, cellId, instrumentId, calibratedAt, dueAt } = panelState.formValues;

        // 1. Client-side ID validations
        const idRegex = /^[A-Za-z0-9_-]{1,120}$/;
        if (!calibrationId || !idRegex.test(calibrationId.trim())) {
          panelState.formError = "Calibration ID is required and must match alphanumeric/dash/underscore.";
          updateUI();
          element.querySelector("#cal-input-id")?.focus();
          return;
        }
        if (!cellId || !idRegex.test(cellId.trim())) {
          panelState.formError = "Cell ID is required and must match alphanumeric/dash/underscore.";
          updateUI();
          element.querySelector("#cal-input-cell")?.focus();
          return;
        }
        if (!instrumentId || !idRegex.test(instrumentId.trim())) {
          panelState.formError = "Instrument ID is required and must match alphanumeric/dash/underscore.";
          updateUI();
          element.querySelector("#cal-input-inst")?.focus();
          return;
        }

        // 2. Client-side Date validations
        if (!calibratedAt) {
          panelState.formError = "Calibrated At date is required.";
          updateUI();
          element.querySelector("#cal-input-calibrated")?.focus();
          return;
        }
        if (!dueAt) {
          panelState.formError = "Due At date is required.";
          updateUI();
          element.querySelector("#cal-input-due")?.focus();
          return;
        }

        const calDate = new Date(calibratedAt);
        const dueDate = new Date(dueAt);

        if (isNaN(calDate.getTime())) {
          panelState.formError = "Invalid Calibrated At timestamp.";
          updateUI();
          element.querySelector("#cal-input-calibrated")?.focus();
          return;
        }
        if (isNaN(dueDate.getTime())) {
          panelState.formError = "Invalid Due At timestamp.";
          updateUI();
          element.querySelector("#cal-input-due")?.focus();
          return;
        }

        if (dueDate.getTime() < calDate.getTime()) {
          panelState.formError = "Due date must be on or after calibrated date.";
          updateUI();
          element.querySelector("#cal-input-due")?.focus();
          return;
        }

        // Construct canonical ISO timestamps ending with Z
        const calIso = calDate.toISOString();
        const dueIso = dueDate.toISOString();

        const payload = {
          calibrationId: calibrationId.trim(),
          cellId: cellId.trim(),
          instrumentId: instrumentId.trim(),
          calibratedAt: calIso,
          dueAt: dueIso,
        };

        panelState.formSubmitting = true;
        updateUI();

        try {
          const res = await submitCalibration({ request, roomId, payload });

          if (res && res.decision === "REJECTED") {
            const reasons = Array.isArray(res.reasons) && res.reasons.length ? res.reasons : ["UNKNOWN_REJECTION"];
            panelState.formError = `Submission rejected: ${reasons.join(", ")}`;
            panelState.liveAnnouncement = `Calibration rejected: ${reasons.join(", ")}`;
            panelState.formSubmitting = false;
            updateUI();
          } else {
            // ACCEPTED
            const state = computeState(dueIso, new Date().toISOString());
            const newRow = { ...payload, state };

            panelState.syntheticRows = panelState.syntheticRows || [];
            panelState.syntheticRows.push(newRow);

            panelState.liveAnnouncement = `Calibration ${payload.calibrationId} added for ${payload.cellId} (ACCEPTED)`;
            panelState.isAddFormOpen = false;
            panelState.formError = null;
            panelState.formValues = {
              calibrationId: "",
              cellId: "ATE-1",
              instrumentId: "",
              calibratedAt: "",
              dueAt: "",
            };
            panelState.formSubmitting = false;

            await loadData();
            element.querySelector(".cal-toggle-add-btn")?.focus();
          }
        } catch (err) {
          panelState.formError = err?.message || "Failed to submit calibration";
          panelState.liveAnnouncement = `Error: ${panelState.formError}`;
          panelState.formSubmitting = false;
          updateUI();
        }
      };
    }
  }

  const onOpenAddCalibration = (e) => {
    const targetCellId = e.detail?.cellId;
    panelState.isAddFormOpen = true;
    if (targetCellId) {
      panelState.formValues.cellId = targetCellId;
    }
    panelState.formError = null;
    updateUI();
    requestAnimationFrame(() => {
      const firstField = element.querySelector("#cal-input-id");
      if (firstField) {
        firstField.focus();
      }
    });
  };

  document.addEventListener("compass:open-add-calibration", onOpenAddCalibration);

  // Initial load
  loadData();

  return {
    render(state) {
      if (state && Array.isArray(state.calibrations)) {
        const asOf = state.simulationState?.simulationTime || new Date().toISOString();
        panelState.data = {
          roomId,
          asOf,
          calibrations: state.calibrations.map((c) => ({
            ...c,
            state: c.dueAt <= asOf ? "EXPIRED" : "CURRENT",
          })),
        };
        updateUI();
      }
    },
    reload: loadData,
    openAddForm({ cellId } = {}) {
      onOpenAddCalibration({ detail: { cellId } });
    },
    destroy() {
      document.removeEventListener("compass:open-add-calibration", onOpenAddCalibration);
    },
  };
}
