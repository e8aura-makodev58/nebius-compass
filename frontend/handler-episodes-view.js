import { setHtml } from "./render-lifecycle.js";
import { trapFocus } from "./focus-trap.js";

/**
 * Handler jam episodes and throughput deficit panel (F4 UI).
 * Spec: docs/design/handler-jam-episodes-slice-1.md
 * Contract: GET /api/control-rooms/:roomId/handler-episodes
 *   → { stationId, window, policyId, policyVersion, episodes, excludedAlarms,
 *       unplannedStoppedMinutes, plannedStopMinutes, runningMinutes,
 *       acceptedUnitsPerRunningMinute, deficitStatus, estimatedDeficitUnits,
 *       deficitBasis, suppressionReasons }
 */

// Per-viewer in-memory state
const stateByRoom = new Map();

export function getPanelState(roomId) {
  if (!stateByRoom.has(roomId)) {
    stateByRoom.set(roomId, {
      searchQuery: "",
      classificationFilter: "ALL", // ALL | PATTERN | SINGLE_EVENT
      selectedEpisodeId: null,
      data: null,
      loading: false,
      error: null,
    });
  }
  return stateByRoom.get(roomId);
}

/**
 * Synthetic fallback handler jam episodes when the endpoint is unmounted (404) or running offline.
 */
export function generateSyntheticHandlerEpisodes(roomId) {
  return {
    stationId: "HANDLER-A",
    window: {
      start: "2026-10-24T06:00:00.000Z",
      end: "2026-10-24T09:00:00.000Z",
    },
    policyId: "JAM-POLICY-A",
    policyVersion: 2,
    episodes: [
      {
        episodeId: "EP-AL-101",
        reasonCode: "JAM_PICK",
        firstOccurredAt: "2026-10-24T06:12:00.000Z",
        lastOccurredAt: "2026-10-24T06:25:00.000Z",
        jamCount: 3,
        alarmIds: ["AL-101", "AL-102", "AL-104"],
        unplannedStoppedMinutes: 14,
        classification: "PATTERN",
      },
      {
        episodeId: "EP-AL-110",
        reasonCode: "JAM_DROP",
        firstOccurredAt: "2026-10-24T07:05:00.000Z",
        lastOccurredAt: "2026-10-24T07:05:00.000Z",
        jamCount: 1,
        alarmIds: ["AL-110"],
        unplannedStoppedMinutes: 4,
        classification: "SINGLE_EVENT",
      },
      {
        episodeId: "EP-AL-120",
        reasonCode: "JAM_TRANSFER",
        firstOccurredAt: "2026-10-24T08:15:00.000Z",
        lastOccurredAt: "2026-10-24T08:22:00.000Z",
        jamCount: 2,
        alarmIds: ["AL-120", "AL-122"],
        unplannedStoppedMinutes: 8,
        classification: "PATTERN",
      },
    ],
    excludedAlarms: 0,
    unplannedStoppedMinutes: 26,
    plannedStopMinutes: 15,
    runningMinutes: 139,
    acceptedUnitsPerRunningMinute: 2.95,
    deficitStatus: "ESTIMATE",
    estimatedDeficitUnits: 78,
    deficitBasis: {
      referenceUnitsPerHour: 180,
      windowMinutes: 180,
      denominator: "UNPLANNED_STOPPED_MINUTES",
    },
    suppressionReasons: [],
  };
}

/**
 * Fetch handler episodes for the specified control room.
 */
export async function fetchHandlerEpisodes({ request, roomId, getState }) {
  // If room state already exposes handlerEpisodes directly, prefer it
  const roomState = getState?.();
  if (roomState?.handlerEpisodes?.episodes) {
    return roomState.handlerEpisodes;
  }

  try {
    const data = await request("/handler-episodes");
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
      return generateSyntheticHandlerEpisodes(roomId);
    }
    throw err;
  }
}

function formatIsoTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const h = String(d.getUTCHours()).padStart(2, "0");
    const min = String(d.getUTCMinutes()).padStart(2, "0");
    return `${h}:${min} UTC`;
  } catch {
    return String(iso);
  }
}

function formatDuration(minutes) {
  if (minutes === undefined || minutes === null) return "—";
  return `${minutes} min`;
}

/**
 * Render Handler Jam Episodes markup.
 */
export function handlerEpisodesMarkup({ escape, panelState }) {
  const { data, loading, error, searchQuery, classificationFilter, selectedEpisodeId } = panelState;
  const allEpisodes = data?.episodes ?? [];

  // Filter episodes
  const query = (searchQuery || "").trim().toLowerCase();
  const filteredEpisodes = allEpisodes.filter((ep) => {
    if (classificationFilter !== "ALL" && ep.classification !== classificationFilter) {
      return false;
    }
    if (!query) return true;
    const matchId = String(ep.episodeId || "").toLowerCase().includes(query);
    const matchReason = String(ep.reasonCode || "").toLowerCase().includes(query);
    const matchClass = String(ep.classification || "").toLowerCase().includes(query);
    const matchAlarms = Array.isArray(ep.alarmIds) && ep.alarmIds.some((a) => String(a).toLowerCase().includes(query));
    return matchId || matchReason || matchClass || matchAlarms;
  });

  const totalCount = allEpisodes.length;
  const patternCount = allEpisodes.filter((e) => e.classification === "PATTERN").length;
  const matchCount = filteredEpisodes.length;

  const countLabel =
    query || classificationFilter !== "ALL"
      ? `${matchCount} of ${totalCount} episode${totalCount === 1 ? "" : "s"}`
      : `${patternCount} pattern${patternCount === 1 ? "" : "s"} · ${totalCount} total`;

  const stationId = data?.stationId || "HANDLER-A";
  const windowStart = formatIsoTime(data?.window?.start);
  const windowEnd = formatIsoTime(data?.window?.end);
  const windowDisplay = data?.window ? `${windowStart} – ${windowEnd}` : "—";

  const isEstimate = data?.deficitStatus === "ESTIMATE";
  const isSuppressed = data?.deficitStatus === "SUPPRESSED";

  return `
    <div class="handler-episodes-panel">
      <header class="he-header">
        <div>
          <p class="eyebrow">ATE Setup Operations · F4</p>
          <h3 id="handler-episodes-heading">Handler Episodes</h3>
        </div>
        <div class="he-header-meta">
          <span class="he-station-badge" data-station-id="${escape(stationId)}">${escape(stationId)}</span>
          <span class="he-count-badge" data-episode-count="${matchCount}">${escape(countLabel)}</span>
        </div>
      </header>

      <!-- Window Summary & Deficit Banner -->
      <section class="he-summary-banner" aria-label="Window throughput and deficit summary">
        <div class="he-summary-grid">
          <div class="he-metric-card">
            <span class="he-metric-label">Window</span>
            <strong class="he-metric-val" data-metric="window">${escape(windowDisplay)}</strong>
          </div>
          <div class="he-metric-card">
            <span class="he-metric-label">Unplanned Stopped</span>
            <strong class="he-metric-val" data-metric="unplanned">${formatDuration(data?.unplannedStoppedMinutes)}</strong>
          </div>
          <div class="he-metric-card">
            <span class="he-metric-label">Planned Stop</span>
            <strong class="he-metric-val" data-metric="planned">${formatDuration(data?.plannedStopMinutes)}</strong>
          </div>
          <div class="he-metric-card">
            <span class="he-metric-label">Running Time</span>
            <strong class="he-metric-val" data-metric="running">${formatDuration(data?.runningMinutes)}</strong>
          </div>
          <div class="he-metric-card">
            <span class="he-metric-label">Accepted Units/Min</span>
            <strong class="he-metric-val" data-metric="rate">${data?.acceptedUnitsPerRunningMinute !== null && data?.acceptedUnitsPerRunningMinute !== undefined ? escape(String(data.acceptedUnitsPerRunningMinute)) : "—"}</strong>
          </div>
        </div>

        <!-- Deficit Output Gate Display -->
        <div class="he-deficit-card ${isEstimate ? "he-deficit-estimate" : isSuppressed ? "he-deficit-suppressed" : ""}" role="region" aria-label="Reference-rate deficit status">
          ${
            isEstimate
              ? `
            <div class="he-deficit-header">
              <span class="he-deficit-tag">ESTIMATE</span>
              <strong class="he-deficit-title">Estimate: ${escape(String(data.estimatedDeficitUnits))} units</strong>
            </div>
            <p class="he-deficit-basis">
              Basis: ${escape(String(data.deficitBasis?.referenceUnitsPerHour ?? "—"))} units/hr · ${escape(String(data.deficitBasis?.windowMinutes ?? "—"))} min window · Denominator: ${escape(String(data.deficitBasis?.denominator ?? "UNPLANNED_STOPPED_MINUTES"))}
            </p>
          `
              : isSuppressed
              ? `
            <div class="he-deficit-header">
              <span class="he-deficit-tag he-tag-suppressed">SUPPRESSED</span>
              <strong class="he-deficit-title">Suppressed: ${escape((data.suppressionReasons || []).join(", ") || "GATE_CONDITION_FAILED")}</strong>
            </div>
            <p class="he-deficit-basis">
              Deficit estimation withheld: requires consistent context, positive reference rate, and active running time. Raw stopped minutes remain accurate.
            </p>
          `
              : `
            <div class="he-deficit-header">
              <span class="he-deficit-tag">AWAITING DATA</span>
              <strong class="he-deficit-title">Deficit comparison pending</strong>
            </div>
          `
          }
          ${
            data?.excludedAlarms && data.excludedAlarms > 0
              ? `<p class="he-excluded-notice">${escape(String(data.excludedAlarms))} alarm${data.excludedAlarms === 1 ? "" : "s"} excluded due to missing timestamp</p>`
              : ""
          }
        </div>
      </section>

      <!-- Toolbar -->
      <div class="he-toolbar" role="region" aria-label="Handler episode filters">
        <div class="he-search-wrap">
          <input
            type="search"
            class="he-search-input"
            id="he-search-input"
            placeholder="Search episodes, reasons, alarms…"
            value="${escape(searchQuery)}"
            aria-label="Search episodes by ID, reason code, classification, or alarm ID"
          />
        </div>

        <div class="he-controls-wrap">
          <label class="he-filter-label" for="he-classification-select">
            Classification
            <select class="he-classification-select" id="he-classification-select" aria-label="Filter by episode classification">
              <option value="ALL" ${classificationFilter === "ALL" ? "selected" : ""}>All</option>
              <option value="PATTERN" ${classificationFilter === "PATTERN" ? "selected" : ""}>Pattern (≥2 jams)</option>
              <option value="SINGLE_EVENT" ${classificationFilter === "SINGLE_EVENT" ? "selected" : ""}>Single event</option>
            </select>
          </label>

          <button type="button" class="he-refresh-button secondary-button" aria-label="Refresh handler episodes">
            Refresh
          </button>
        </div>
      </div>

      <!-- Content Area -->
      <div class="he-content">
        ${
          loading
            ? `
          <div class="he-state he-loading" role="status">
            <span class="activity-spinner"></span>
            <span>Loading handler episodes…</span>
          </div>`
            : error
            ? `
          <div class="he-state he-error he-error-state" role="alert">
            <p class="load-error">Failed to load handler episodes: ${escape(error.message || "Unknown error")}</p>
            <button type="button" class="he-retry-button secondary-button">Retry</button>
          </div>`
            : filteredEpisodes.length === 0
            ? `
          <div class="he-state he-empty he-empty-state">
            <p class="workflow-prompt">No handler episodes match the current search or filter.</p>
            <button type="button" class="he-reset-filter-button secondary-button">Reset filters</button>
          </div>`
            : `
          <!-- Desktop table layout (>= 901px) -->
          <div class="he-table-container">
            <table class="he-table" aria-label="Handler jam episodes table">
              <thead>
                <tr>
                  <th scope="col">Episode ID</th>
                  <th scope="col">Classification</th>
                  <th scope="col">Reason Code</th>
                  <th scope="col">Jams</th>
                  <th scope="col">Unplanned Stopped</th>
                  <th scope="col">Alarm Trail</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                ${filteredEpisodes
                  .map((ep) => {
                    const isPattern = ep.classification === "PATTERN";
                    const badgeCls = isPattern ? "he-badge-pattern" : "he-badge-single";
                    const badgeLabel = isPattern ? "Pattern" : "Single Event";
                    const isInspected = selectedEpisodeId === ep.episodeId;
                    const alarmsDisplay = Array.isArray(ep.alarmIds)
                      ? ep.alarmIds.map((a) => `<span class="he-alarm-chip">${escape(a)}</span>`).join(" ")
                      : "—";

                    return `
                      <tr data-episode-id="${escape(ep.episodeId)}" class="${isInspected ? "he-row-inspected" : ""}">
                        <td class="he-cell-id"><strong>${escape(ep.episodeId)}</strong></td>
                        <td class="he-cell-class"><span class="he-badge ${badgeCls}">${badgeLabel}</span></td>
                        <td class="he-cell-reason"><code>${escape(ep.reasonCode)}</code></td>
                        <td class="he-cell-jams"><strong>${escape(String(ep.jamCount))}</strong></td>
                        <td class="he-cell-stopped">${formatDuration(ep.unplannedStoppedMinutes)}</td>
                        <td class="he-cell-alarms"><div class="he-alarms-list">${alarmsDisplay}</div></td>
                        <td class="he-cell-actions">
                          <button
                            type="button"
                            class="he-action-btn secondary-button"
                            data-episode-id="${escape(ep.episodeId)}"
                            aria-expanded="${isInspected ? "true" : "false"}"
                            aria-label="Inspect episode ${escape(ep.episodeId)}"
                          >
                            ${isInspected ? "Close" : "Inspect"}
                          </button>
                        </td>
                      </tr>
                      ${
                        isInspected
                          ? `
                      <tr class="he-row-detail-wrap" data-detail-for="${escape(ep.episodeId)}">
                        <td colspan="7">
                          <div class="he-detail-drawer" role="region" aria-label="Inspection details for ${escape(ep.episodeId)}">
                            <div class="he-detail-title">
                              <strong>${escape(ep.episodeId)} · ${escape(ep.reasonCode)}</strong>
                              <span class="he-badge ${badgeCls}">${badgeLabel}</span>
                            </div>
                            <div class="he-detail-grid">
                              <div><span>First Occurred:</span> <em>${formatIsoTime(ep.firstOccurredAt)}</em></div>
                              <div><span>Last Occurred:</span> <em>${formatIsoTime(ep.lastOccurredAt)}</em></div>
                              <div><span>Total Jams:</span> <em>${escape(String(ep.jamCount))}</em></div>
                              <div><span>Unplanned Stopped:</span> <em>${formatDuration(ep.unplannedStoppedMinutes)}</em></div>
                            </div>
                            <div class="he-detail-alarms-section">
                              <span class="he-detail-label">Complete Alarm Trail (${ep.alarmIds?.length ?? 0}):</span>
                              <div class="he-alarms-full-list">
                                ${Array.isArray(ep.alarmIds) ? ep.alarmIds.map((id) => `<span class="he-alarm-chip-lg"><code>${escape(id)}</code></span>`).join("") : "None"}
                              </div>
                            </div>
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
          <div class="he-cards-container" role="list" aria-label="Handler jam episodes list">
            ${filteredEpisodes
              .map((ep) => {
                const isPattern = ep.classification === "PATTERN";
                const badgeCls = isPattern ? "he-badge-pattern" : "he-badge-single";
                const badgeLabel = isPattern ? "Pattern" : "Single Event";
                const isInspected = selectedEpisodeId === ep.episodeId;
                const alarmsDisplay = Array.isArray(ep.alarmIds)
                  ? ep.alarmIds.map((a) => `<span class="he-alarm-chip">${escape(a)}</span>`).join(" ")
                  : "—";

                return `
                  <article class="he-card" role="listitem" data-episode-id="${escape(ep.episodeId)}">
                    <div class="he-card-top">
                      <div class="he-card-title">
                        <strong class="he-id">${escape(ep.episodeId)}</strong>
                        <span class="he-card-reason"><code>${escape(ep.reasonCode)}</code></span>
                      </div>
                      <div class="he-card-badges">
                        <span class="he-badge ${badgeCls}">${badgeLabel}</span>
                      </div>
                    </div>

                    <div class="he-card-grid">
                      <div class="he-card-row">
                        <span class="he-card-key">Jams:</span>
                        <span class="he-card-val">${escape(String(ep.jamCount))}</span>
                      </div>
                      <div class="he-card-row">
                        <span class="he-card-key">Unplanned Stopped:</span>
                        <span class="he-card-val">${formatDuration(ep.unplannedStoppedMinutes)}</span>
                      </div>
                      <div class="he-card-row">
                        <span class="he-card-key">Time Range:</span>
                        <span class="he-card-val">${formatIsoTime(ep.firstOccurredAt)} – ${formatIsoTime(ep.lastOccurredAt)}</span>
                      </div>
                      <div class="he-card-row he-card-row-alarms">
                        <span class="he-card-key">Alarms:</span>
                        <div class="he-alarms-list">${alarmsDisplay}</div>
                      </div>
                    </div>

                    <div class="he-card-actions">
                      <button
                        type="button"
                        class="he-action-btn secondary-button"
                        data-episode-id="${escape(ep.episodeId)}"
                        aria-expanded="${isInspected ? "true" : "false"}"
                        aria-label="Inspect episode ${escape(ep.episodeId)}"
                      >
                        ${isInspected ? "Close inspection" : "Inspect"}
                      </button>
                    </div>

                    ${
                      isInspected
                        ? `
                    <div class="he-detail-drawer" role="region" aria-label="Inspection details for ${escape(ep.episodeId)}">
                      <strong>${escape(ep.episodeId)} · ${escape(ep.reasonCode)}</strong>
                      <p>First: <em>${formatIsoTime(ep.firstOccurredAt)}</em> · Last: <em>${formatIsoTime(ep.lastOccurredAt)}</em></p>
                      <p>Stopped: <em>${formatDuration(ep.unplannedStoppedMinutes)}</em> · Count: <em>${escape(String(ep.jamCount))} jams</em></p>
                      <div class="he-detail-alarms-section">
                        <span class="he-detail-label">Alarm Trail (${ep.alarmIds?.length ?? 0}):</span>
                        <div class="he-alarms-full-list">
                          ${Array.isArray(ep.alarmIds) ? ep.alarmIds.map((id) => `<span class="he-alarm-chip-lg"><code>${escape(id)}</code></span>`).join("") : "None"}
                        </div>
                      </div>
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
 * Initialize Handler Episodes panel on the container element.
 */
export function initHandlerEpisodes({ element, request, escape, roomId, getState }) {
  const panelState = getPanelState(roomId);

  async function loadData() {
    panelState.loading = true;
    panelState.error = null;
    updateUI();

    try {
      const data = await fetchHandlerEpisodes({ request, roomId, getState });
      panelState.data = data;
    } catch (err) {
      panelState.error = err;
    } finally {
      panelState.loading = false;
      updateUI();
    }
  }

  function updateUI() {
    const html = handlerEpisodesMarkup({ escape, panelState });
    const wrote = setHtml(element, html);
    if (wrote) {
      bindEvents();
    }
  }

  function bindEvents() {
    // Search input: preserve focus and selection cursor across keystrokes
    const searchInput = element.querySelector("#he-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        panelState.searchQuery = e.target.value;
        updateUI();
        const nextInput = element.querySelector("#he-search-input");
        if (nextInput) {
          nextInput.focus();
          try {
            nextInput.setSelectionRange(start, end);
          } catch {}
        }
      });
    }

    // Classification select: preserve focus on dropdown
    const classSelect = element.querySelector("#he-classification-select");
    if (classSelect) {
      classSelect.addEventListener("change", (e) => {
        panelState.classificationFilter = e.target.value;
        updateUI();
        const nextSelect = element.querySelector("#he-classification-select");
        if (nextSelect) {
          nextSelect.focus();
        }
      });
    }

    // Refresh button
    const refreshBtn = element.querySelector(".he-refresh-button");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        loadData();
      });
    }

    // Retry button
    const retryBtn = element.querySelector(".he-retry-button");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        loadData();
      });
    }

    // Reset filter button
    const resetBtn = element.querySelector(".he-reset-filter-button");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        panelState.searchQuery = "";
        panelState.classificationFilter = "ALL";
        updateUI();
        element.querySelector("#he-search-input")?.focus();
      });
    }

    // Row action buttons: toggle inspect
    element.querySelectorAll(".he-action-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const episodeId = e.currentTarget.dataset.episodeId;
        panelState.selectedEpisodeId = panelState.selectedEpisodeId === episodeId ? null : episodeId;
        updateUI();
        element.querySelector(`.he-action-btn[data-episode-id="${episodeId}"]`)?.focus();
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && panelState.selectedEpisodeId === btn.dataset.episodeId) {
          e.preventDefault();
          panelState.selectedEpisodeId = null;
          updateUI();
          element.querySelector(`.he-action-btn[data-episode-id="${btn.dataset.episodeId}"]`)?.focus();
        }
      });
    });

    // Inspect detail drawer keyboard Escape
    element.querySelectorAll(".he-detail-drawer").forEach((drawer) => {
      drawer.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          const episodeId = panelState.selectedEpisodeId;
          panelState.selectedEpisodeId = null;
          updateUI();
          if (episodeId) {
            element.querySelector(`.he-action-btn[data-episode-id="${episodeId}"]`)?.focus();
          }
        } else if (e.key === "Tab") {
          trapFocus(drawer, e);
        }
      });
    });
  }

  // Initial load
  loadData();

  return {
    render() {
      // Re-render when external room state updates
      const roomState = getState?.();
      if (roomState?.handlerEpisodes?.episodes) {
        panelState.data = roomState.handlerEpisodes;
      }
      updateUI();
    },
    destroy() {},
  };
}
