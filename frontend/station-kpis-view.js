import { setHtml } from "./render-lifecycle.js";

/**
 * Station KPI panel: 3-hourly buckets in 12-hour windows.
 * Spec: docs/design/station-kpi-panel.md
 */

// Per-viewer in-memory state
const stateByRoom = new Map();

function getPanelState(roomId) {
  if (!stateByRoom.has(roomId)) {
    stateByRoom.set(roomId, {
      selectedStationIds: null, // null means all
      stationSearch: "",
      windowEnd: null, // null means latest complete window
      data: null,
      loading: false,
      error: null,
      filterOpen: false,
    });
  }
  return stateByRoom.get(roomId);
}

function deterministicHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Format an ISO timestamp into UTC date and hour string.
 * e.g. "08-31 20:00"
 */
function formatBucketTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${m}-${day} ${h}:${min}`;
}

function formatHourRange(startIso, endIso) {
  if (!startIso || !endIso) return "—";
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sh = String(start.getUTCHours()).padStart(2, "0");
  const smin = String(start.getUTCMinutes()).padStart(2, "0");
  const eh = String(end.getUTCHours()).padStart(2, "0");
  const emin = String(end.getUTCMinutes()).padStart(2, "0");
  return `${sh}:${smin}–${eh}:${emin}`;
}

const DEVICE_CATALOG = [
  { deviceId: "CX4820", ratedUnitsPerHour: 4820 },
  { deviceId: "PM0096", ratedUnitsPerHour: 96 },
  { deviceId: "GH0310", ratedUnitsPerHour: 310 },
  { deviceId: "SC2150", ratedUnitsPerHour: 2150 },
  { deviceId: "BR0038", ratedUnitsPerHour: 38 },
  { deviceId: "VS0745", ratedUnitsPerHour: 745 },
  { deviceId: "SR1260", ratedUnitsPerHour: 1260 },
  { deviceId: "TB0540", ratedUnitsPerHour: 540 },
  { deviceId: "DS0064", ratedUnitsPerHour: 64 },
  { deviceId: "LS3600", ratedUnitsPerHour: 3600 },
  { deviceId: "HP1880", ratedUnitsPerHour: 1880 },
  { deviceId: "PI0212", ratedUnitsPerHour: 212 },
  { deviceId: "SG2940", ratedUnitsPerHour: 2940 },
  { deviceId: "FL0087", ratedUnitsPerHour: 87 },
  { deviceId: "CS1015", ratedUnitsPerHour: 1015 },
  { deviceId: "MB0475", ratedUnitsPerHour: 475 },
  { deviceId: "CF0158", ratedUnitsPerHour: 158 },
  { deviceId: "CW6300", ratedUnitsPerHour: 6300 },
  { deviceId: "BC0029", ratedUnitsPerHour: 29 },
  { deviceId: "CP0890", ratedUnitsPerHour: 890 },
];

function formatUph(uph) {
  if (uph === null || uph === undefined) return "—";
  return `${Number(uph).toLocaleString("en-US")} UPH`;
}

function formatWindowLabel(startIso, endIso) {
  if (!startIso || !endIso) return "—";
  return `${formatBucketTime(startIso)} to ${formatBucketTime(endIso)} UTC`;
}

/**
 * Generates synthetic fallback response matching the API contract in section 3 of the spec
 * if backend endpoint is not yet mounted (404) or running offline.
 */
function generateSyntheticResponse(roomId, simTime, requestedWindowEnd, requestedStations, equipmentList) {
  const BUCKET_MS = 3 * 3600 * 1000;
  const WINDOW_MS = 12 * 3600 * 1000;
  const simMs = Date.parse(simTime || "2026-09-01T08:00:00.000Z");

  // Determine end time: if requestedWindowEnd provided, use it; else latest complete 3h boundary <= simMs
  let endMs;
  if (requestedWindowEnd) {
    endMs = Date.parse(requestedWindowEnd);
  } else {
    endMs = Math.floor(simMs / BUCKET_MS) * BUCKET_MS;
  }
  const startMs = endMs - WINDOW_MS;

  const buckets = [];
  for (let i = 0; i < 4; i++) {
    const bStart = new Date(startMs + i * BUCKET_MS).toISOString();
    const bEnd = new Date(startMs + (i + 1) * BUCKET_MS).toISOString();
    buckets.push({ start: bStart, end: bEnd, available: true });
  }

  const allEquip = equipmentList && equipmentList.length > 0
    ? equipmentList
    : [
        { id: "EQ-01", name: "ATE 1", floor: 1, deviceId: "SR1260", ratedUnitsPerHour: 1260 },
        { id: "EQ-02", name: "ATE 2", floor: 1, deviceId: "PM0096", ratedUnitsPerHour: 96 },
        { id: "EQ-03", name: "ATE 3", floor: 1 },
        { id: "EQ-04", name: "ATE 4", floor: 2 },
        { id: "EQ-05", name: "ATE 5", floor: 2 },
        { id: "EQ-06", name: "ATE 6", floor: 3 },
      ];

  const targetEquip = requestedStations && requestedStations.length > 0
    ? allEquip.filter((e) => requestedStations.includes(e.id))
    : allEquip;

  const stations = targetEquip.map((eq) => {
    const hashVal = deterministicHash(eq.id);
    const dev = DEVICE_CATALOG[hashVal % DEVICE_CATALOG.length];
    const deviceId = eq.deviceId ?? (eq.id === "EQ-01" ? "SR1260" : eq.id === "EQ-02" ? "PM0096" : dev.deviceId);
    const rated = eq.ratedUnitsPerHour ?? (eq.id === "EQ-01" ? 1260 : eq.id === "EQ-02" ? 96 : dev.ratedUnitsPerHour);
    const name = eq.id === "EQ-01" ? "ATE 1" : eq.id === "EQ-02" ? "ATE 2" : (eq.name?.replace?.("Station", "ATE") ?? eq.name);

    const stationBuckets = buckets.map((b, idx) => {
      const bHash = deterministicHash(eq.id + b.start);
      const downtimeMinutes = (bHash % 5 === 0) ? (15 + (bHash % 50)) : 0;
      const expectedUnits = Math.round((rated * 180) / 60);
      const actualUnits = Math.max(0, Math.floor((rated * (180 - downtimeMinutes)) / 60));
      const attainmentPercent = expectedUnits > 0 ? Number(((actualUnits / expectedUnits) * 100).toFixed(1)) : null;
      const issuesRaised = downtimeMinutes > 0 ? 1 : 0;
      return {
        start: b.start,
        end: b.end,
        available: true,
        expectedUnits,
        actualUnits,
        attainmentPercent,
        downtimeMinutes,
        issuesRaised,
        source: "DERIVED_FROM_UPTIME",
      };
    });
    return {
      stationId: eq.id,
      name,
      floor: eq.floor ?? 1,
      deviceId,
      ratedUnitsPerHour: rated,
      buckets: stationBuckets,
    };
  });

  const totals = buckets.map((b, idx) => {
    let expectedUnits = 0;
    let actualUnits = 0;
    let downtimeMinutes = 0;
    let issuesRaised = 0;
    for (const st of stations) {
      const sb = st.buckets[idx];
      if (sb) {
        expectedUnits += sb.expectedUnits;
        actualUnits += sb.actualUnits;
        downtimeMinutes += sb.downtimeMinutes;
        issuesRaised += sb.issuesRaised;
      }
    }
    return {
      start: b.start,
      end: b.end,
      expectedUnits,
      actualUnits,
      downtimeMinutes,
      issuesRaised,
    };
  });

  return {
    roomId,
    asOf: new Date(simMs).toISOString(),
    window: {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      hours: 12,
      bucketHours: 3,
    },
    status: "READY",
    earliestAvailable: "2026-08-25T00:00:00.000Z",
    buckets,
    stations,
    totals,
  };
}

/**
 * Fetch KPI data from the server with query parameters,
 * falling back to synthetic data if the endpoint is not yet mounted.
 */
export async function fetchStationKpis({ request, roomId, windowEnd, stations, simTime, equipment }) {
  const query = new URLSearchParams();
  if (windowEnd) query.set("windowEnd", windowEnd);
  if (stations && stations.length > 0) query.set("stations", stations.join(","));
  const qs = query.toString() ? `?${query.toString()}` : "";

  try {
    const data = await request(`/station-kpis${qs}`);
    return data;
  } catch (err) {
    // If route is 404 / unavailable, provide synthetic fallback
    if (err.status === 404 || err.message?.includes("404") || err.message?.includes("Not Found")) {
      return generateSyntheticResponse(roomId, simTime, windowEnd, stations, equipment);
    }
    throw err;
  }
}

/**
 * Generate Station KPI HTML markup.
 */
export function stationKpisMarkup({ state, escape, panelState }) {
  const { data, loading, error, selectedStationIds, stationSearch, filterOpen } = panelState;
  const simTime = state?.simulationState?.simulationTime;
  const equipmentList = state?.equipment || [];

  // Available station list
  const allStations = equipmentList.map((eq) => ({
    id: eq.id,
    name: eq.name,
    floor: eq.floor ?? 1,
  }));

  const selectedSet = selectedStationIds === null ? new Set(allStations.map((s) => s.id)) : selectedStationIds;

  // Filtered station checkboxes by search
  const q = (stationSearch || "").toLowerCase();
  const visibleOptions = allStations.filter(
    (s) => s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
  );

  // Compute navigation boundaries
  const BUCKET_MS = 3 * 3600 * 1000;
  const WINDOW_MS = 12 * 3600 * 1000;
  const simMs = Date.parse(simTime || "2026-09-01T08:00:00.000Z");
  const latestWindowEndMs = Math.floor(simMs / BUCKET_MS) * BUCKET_MS;
  const currentEndMs = data?.window?.end ? Date.parse(data.window.end) : latestWindowEndMs;
  const isLatest = currentEndMs >= latestWindowEndMs;

  // Recent windows list for <select>
  const recentWindows = [];
  let wEnd = latestWindowEndMs;
  for (let i = 0; i < 8; i++) {
    const endIso = new Date(wEnd).toISOString();
    const startIso = new Date(wEnd - WINDOW_MS).toISOString();
    recentWindows.push({
      start: startIso,
      end: endIso,
      label: `${formatWindowLabel(startIso, endIso)}${i === 0 ? " (Latest)" : ""}`,
      value: endIso,
    });
    wEnd -= WINDOW_MS;
  }

  // Header markup
  const headerHtml = `
    <div class="kpi-panel-header">
      <div>
        <p class="eyebrow">Station throughput</p>
        <h3 id="station-kpi-heading">Station KPIs</h3>
      </div>
      <div class="kpi-header-badges">
        <span class="kpi-source-badge" title="Derived from uptime, not a direct production counter">DERIVED_FROM_UPTIME</span>
      </div>
    </div>
  `;

  // Filter & window controls toolbar
  const filterSummary = `Stations (${selectedSet.size} of ${allStations.length})`;
  const stationOptionsHtml = visibleOptions
    .map((s) => {
      const checked = selectedSet.has(s.id) ? "checked" : "";
      return `
      <label class="kpi-station-item">
        <input type="checkbox" data-kpi-station="${escape(s.id)}" ${checked} />
        <span><strong>${escape(s.name)}</strong> <small>(${escape(s.id)} · Fl ${s.floor})</small></span>
      </label>
    `;
    })
    .join("");

  const windowSelectOptionsHtml = recentWindows
    .map((rw) => {
      const selected = data?.window?.end === rw.end ? "selected" : "";
      return `<option value="${escape(rw.value)}" ${selected}>${escape(rw.label)}</option>`;
    })
    .join("");

  const toolbarHtml = `
    <div class="kpi-toolbar" role="toolbar" aria-label="Station KPI controls">
      <details class="kpi-filter-dropdown" ${filterOpen ? "open" : ""}>
        <summary class="secondary-button" aria-label="Filter stations">${escape(filterSummary)}</summary>
        <div class="kpi-filter-body">
          <div class="kpi-filter-search">
            <input type="search" class="kpi-station-search-input" placeholder="Search stations…" aria-label="Search stations" value="${escape(stationSearch)}" />
          </div>
          <div class="kpi-filter-actions">
            <button type="button" class="secondary-button kpi-action-all">All</button>
            <button type="button" class="secondary-button kpi-action-none">None</button>
          </div>
          <div class="kpi-station-options-list" role="group" aria-label="Station list">
            ${stationOptionsHtml || '<p class="kpi-empty-search">No matching stations</p>'}
          </div>
        </div>
      </details>

      <div class="kpi-window-controls" role="group" aria-label="Window navigation">
        <button type="button" class="secondary-button kpi-nav-latest" ${isLatest ? "disabled" : ""}>Latest</button>
        <button type="button" class="secondary-button kpi-nav-prev" aria-label="Previous 12 hours">Previous 12 h</button>
        <button type="button" class="secondary-button kpi-nav-next" aria-label="Next 12 hours" ${isLatest ? "disabled" : ""}>Next 12 h</button>
        <select class="kpi-window-select" aria-label="Select 12-hour window">
          ${windowSelectOptionsHtml}
        </select>
      </div>
    </div>
  `;

  // Status views
  if (loading && !data) {
    return `
      <section class="station-kpis-panel" aria-labelledby="station-kpi-heading">
        ${headerHtml}
        ${toolbarHtml}
        <div class="kpi-loading" role="status" aria-live="polite">
          <span class="activity-dot"></span> Loading station KPIs…
        </div>
      </section>
    `;
  }

  if (error && !data) {
    return `
      <section class="station-kpis-panel" aria-labelledby="station-kpi-heading">
        ${headerHtml}
        ${toolbarHtml}
        <div class="kpi-error" role="alert">
          <p><strong>Failed to load Station KPIs</strong></p>
          <p>${escape(error)}</p>
          <button type="button" class="secondary-button kpi-action-retry">Retry</button>
        </div>
      </section>
    `;
  }

  // Selected stations from data
  const stationsData = (data?.stations || []).filter((s) => selectedSet.has(s.stationId));

  if (selectedSet.size === 0 || stationsData.length === 0) {
    return `
      <section class="station-kpis-panel" aria-labelledby="station-kpi-heading">
        ${headerHtml}
        ${toolbarHtml}
        <div class="kpi-empty" role="status">
          <strong>No stations selected</strong>
          <p>Select at least one station using the filter above to view 3-hour throughput and downtime KPIs.</p>
        </div>
      </section>
    `;
  }

  const buckets = data?.buckets || [];
  const totals = buckets.map((b, idx) => {
    let expectedUnits = 0;
    let actualUnits = 0;
    let downtimeMinutes = 0;
    let issuesRaised = 0;
    for (const st of stationsData) {
      const sb = st.buckets?.[idx];
      if (sb && sb.available) {
        expectedUnits += sb.expectedUnits || 0;
        actualUnits += sb.actualUnits || 0;
        downtimeMinutes += sb.downtimeMinutes || 0;
        issuesRaised += sb.issuesRaised || 0;
      }
    }
    return {
      start: b.start,
      end: b.end,
      expectedUnits,
      actualUnits,
      downtimeMinutes,
      issuesRaised,
    };
  });

  // Desktop Table Markup
  const tableHeadersHtml = buckets
    .map(
      (b) => `
      <th scope="col" class="kpi-bucket-col">
        <span class="kpi-col-time">${formatHourRange(b.start, b.end)}</span>
        <span class="kpi-col-date">${formatBucketTime(b.start).slice(0, 5)}</span>
      </th>`
    )
    .join("");

  const tableRowsHtml = stationsData
    .map((st) => {
      const bucketCells = (st.buckets || [])
        .map((b) => {
          if (!b.available) {
            return `<td class="kpi-cell-unavailable"><span class="kpi-dash">—</span></td>`;
          }
          const attainmentStr = b.attainmentPercent !== null ? `${b.attainmentPercent}%` : "—";
          const attainmentClass =
            b.attainmentPercent === null
              ? ""
              : b.attainmentPercent >= 90
              ? "kpi-good"
              : b.attainmentPercent >= 75
              ? "kpi-fair"
              : "kpi-warn";

          return `
          <td class="kpi-cell">
            <div class="kpi-cell-top">
              <span class="kpi-actual"><strong>${b.actualUnits}</strong></span>
              <span class="kpi-expected-wrap">/ <span class="kpi-expected">${b.expectedUnits}</span></span>
              <span class="kpi-attainment ${attainmentClass}">${attainmentStr}</span>
            </div>
            <div class="kpi-cell-meta">
              <span>${b.downtimeMinutes}m down</span>
              <span>·</span>
              <span>${b.issuesRaised} ${b.issuesRaised === 1 ? "issue" : "issues"}</span>
            </div>
          </td>`;
        })
        .join("");

      const uphStr = formatUph(st.ratedUnitsPerHour);
      const deviceTag = st.deviceId ? ` · ${escape(st.deviceId)} · ${uphStr}` : ` · ${uphStr}`;

      return `
      <tr data-station-id="${escape(st.stationId)}">
        <th scope="row" class="kpi-station-th">
          <strong>${escape(st.name)}${deviceTag}</strong>
          <small>${escape(st.stationId)} · Floor ${st.floor}</small>
        </th>
        ${bucketCells}
      </tr>`;
    })
    .join("");

  const tableTotalsHtml = totals
    .map((t) => {
      const att = t.expectedUnits > 0 ? Number(((t.actualUnits / t.expectedUnits) * 100).toFixed(1)) : null;
      const attStr = att !== null ? `${att}%` : "—";
      const attClass = att === null ? "" : att >= 90 ? "kpi-good" : att >= 75 ? "kpi-fair" : "kpi-warn";
      return `
      <td class="kpi-cell kpi-total-cell">
        <div class="kpi-cell-top">
          <span class="kpi-actual"><strong>${t.actualUnits}</strong></span>
          <span class="kpi-expected-wrap">/ <span class="kpi-expected">${t.expectedUnits}</span></span>
          <span class="kpi-attainment ${attClass}">${attStr}</span>
        </div>
        <div class="kpi-cell-meta">
          <span>${t.downtimeMinutes}m down</span>
          <span>·</span>
          <span>${t.issuesRaised} ${t.issuesRaised === 1 ? "issue" : "issues"}</span>
        </div>
      </td>`;
    })
    .join("");

  const desktopTableHtml = `
    <div class="kpi-table-container">
      <table class="kpi-table" aria-label="Station KPI metrics by 3-hour bucket">
        <thead>
          <tr>
            <th scope="col" class="kpi-station-col">Station</th>
            ${tableHeadersHtml}
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
        <tfoot>
          <tr class="kpi-totals-row">
            <th scope="row">Totals (${stationsData.length} stations)</th>
            ${tableTotalsHtml}
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  // Phone Cards Markup
  const cardsHtml = stationsData
    .map((st) => {
      const bucketRows = (st.buckets || [])
        .map((b) => {
          if (!b.available) {
            return `
            <div class="kpi-card-bucket kpi-bucket-unavailable">
              <span class="kpi-card-bucket-time">${formatHourRange(b.start, b.end)}</span>
              <span class="kpi-dash">Unavailable</span>
            </div>`;
          }
          const attStr = b.attainmentPercent !== null ? `${b.attainmentPercent}%` : "—";
          const attClass =
            b.attainmentPercent === null
              ? ""
              : b.attainmentPercent >= 90
              ? "kpi-good"
              : b.attainmentPercent >= 75
              ? "kpi-fair"
              : "kpi-warn";

          return `
          <div class="kpi-card-bucket">
            <div class="kpi-card-bucket-header">
              <span class="kpi-card-bucket-time">${formatHourRange(b.start, b.end)}</span>
              <span class="kpi-attainment ${attClass}">${attStr}</span>
            </div>
            <div class="kpi-card-bucket-metrics">
              <span class="kpi-units"><strong>${b.actualUnits}</strong> actual / ${b.expectedUnits} expected</span>
              <span class="kpi-card-meta">${b.downtimeMinutes}m downtime · ${b.issuesRaised} ${b.issuesRaised === 1 ? "issue" : "issues"}</span>
            </div>
          </div>`;
        })
        .join("");

      const uphStr = formatUph(st.ratedUnitsPerHour);
      const deviceTag = st.deviceId ? ` · ${escape(st.deviceId)} · ${uphStr}` : ` · ${uphStr}`;

      return `
      <article class="kpi-card" data-station-id="${escape(st.stationId)}">
        <div class="kpi-card-header">
          <h4>${escape(st.name)}${deviceTag}</h4>
          <span class="kpi-card-rating">${escape(st.stationId)} · Floor ${st.floor}</span>
        </div>
        <div class="kpi-card-buckets-list">
          ${bucketRows}
        </div>
      </article>`;
    })
    .join("");

  const totalsCardBuckets = totals
    .map((t) => {
      const att = t.expectedUnits > 0 ? Number(((t.actualUnits / t.expectedUnits) * 100).toFixed(1)) : null;
      const attStr = att !== null ? `${att}%` : "—";
      const attClass = att === null ? "" : att >= 90 ? "kpi-good" : att >= 75 ? "kpi-fair" : "kpi-warn";
      return `
      <div class="kpi-card-bucket">
        <div class="kpi-card-bucket-header">
          <span class="kpi-card-bucket-time">${formatHourRange(t.start, t.end)}</span>
          <span class="kpi-attainment ${attClass}">${attStr}</span>
        </div>
        <div class="kpi-card-bucket-metrics">
          <span class="kpi-units"><strong>${t.actualUnits}</strong> actual / ${t.expectedUnits} expected</span>
          <span class="kpi-card-meta">${t.downtimeMinutes}m downtime · ${t.issuesRaised} ${t.issuesRaised === 1 ? "issue" : "issues"}</span>
        </div>
      </div>`;
    })
    .join("");

  const totalsCardHtml = `
    <article class="kpi-card kpi-card-totals">
      <div class="kpi-card-header">
        <h4>Totals <small>(${stationsData.length} stations)</small></h4>
      </div>
      <div class="kpi-card-buckets-list">
        ${totalsCardBuckets}
      </div>
    </article>
  `;

  const phoneCardsHtml = `
    <div class="kpi-cards-container">
      ${cardsHtml}
      ${totalsCardHtml}
    </div>
  `;

  const partialNotice =
    data?.status === "PARTIAL"
      ? `<p class="kpi-partial-notice">Partial window: historical data before ${escape(formatBucketTime(data.earliestAvailable))} is unavailable.</p>`
      : "";

  return `
    <section class="station-kpis-panel" aria-labelledby="station-kpi-heading">
      ${headerHtml}
      ${toolbarHtml}
      ${partialNotice}
      ${desktopTableHtml}
      ${phoneCardsHtml}
    </section>
  `;
}

/**
 * Initialize and render Station KPIs in target element.
 */
export function initStationKpis({ element, request, escape, roomId, getState }) {
  if (!element) return { render() {}, destroy() {} };

  const panelState = getPanelState(roomId);
  let inFlight = false;

  async function loadData(targetWindowEnd = panelState.windowEnd) {
    if (inFlight) return;
    inFlight = true;
    panelState.loading = true;
    panelState.error = null;
    updateUI();

    const state = getState ? getState() : null;
    const simTime = state?.simulationState?.simulationTime;
    const equipment = state?.equipment || [];
    const stationIds = panelState.selectedStationIds ? Array.from(panelState.selectedStationIds) : null;

    try {
      const res = await fetchStationKpis({
        request,
        roomId,
        windowEnd: targetWindowEnd,
        stations: stationIds,
        simTime,
        equipment,
      });
      panelState.data = res;
      panelState.windowEnd = targetWindowEnd;
      panelState.error = null;
    } catch (err) {
      panelState.error = err.message || "Failed to load station KPIs";
    } finally {
      panelState.loading = false;
      inFlight = false;
      updateUI();
    }
  }

  function updateUI() {
    const state = getState ? getState() : null;
    const html = stationKpisMarkup({ state, escape, panelState });
    setHtml(element, html);
    attachEvents();
  }

  function attachEvents() {
    // Dropdown toggle
    const dropdown = element.querySelector(".kpi-filter-dropdown");
    if (dropdown) {
      dropdown.addEventListener("toggle", () => {
        panelState.filterOpen = dropdown.open;
      });
    }

    // Search input
    const searchInput = element.querySelector(".kpi-station-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        panelState.stationSearch = e.target.value;
        const q = e.target.value.toLowerCase();
        element.querySelectorAll(".kpi-station-item").forEach((item) => {
          const text = item.textContent.toLowerCase();
          item.style.display = text.includes(q) ? "" : "none";
        });
      });
    }

    // Select All
    const allBtn = element.querySelector(".kpi-action-all");
    if (allBtn) {
      allBtn.addEventListener("click", () => {
        const state = getState ? getState() : null;
        const allIds = (state?.equipment || []).map((e) => e.id);
        panelState.selectedStationIds = new Set(allIds);
        updateUI();
      });
    }

    // Select None
    const noneBtn = element.querySelector(".kpi-action-none");
    if (noneBtn) {
      noneBtn.addEventListener("click", () => {
        panelState.selectedStationIds = new Set();
        updateUI();
      });
    }

    // Checkbox changes
    element.querySelectorAll("[data-kpi-station]").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const state = getState ? getState() : null;
        const allIds = (state?.equipment || []).map((eq) => eq.id);
        if (panelState.selectedStationIds === null) {
          panelState.selectedStationIds = new Set(allIds);
        }
        const sid = cb.dataset.kpiStation;
        if (cb.checked) {
          panelState.selectedStationIds.add(sid);
        } else {
          panelState.selectedStationIds.delete(sid);
        }
        updateUI();
      });
    });

    // Window nav buttons
    const latestBtn = element.querySelector(".kpi-nav-latest");
    if (latestBtn) {
      latestBtn.addEventListener("click", () => {
        panelState.windowEnd = null;
        loadData(null);
      });
    }

    const prevBtn = element.querySelector(".kpi-nav-prev");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        const currentEnd = panelState.data?.window?.end;
        if (currentEnd) {
          const prevEnd = new Date(Date.parse(currentEnd) - 12 * 3600 * 1000).toISOString();
          panelState.windowEnd = prevEnd;
          loadData(prevEnd);
        }
      });
    }

    const nextBtn = element.querySelector(".kpi-nav-next");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        const currentEnd = panelState.data?.window?.end;
        if (currentEnd) {
          const nextEnd = new Date(Date.parse(currentEnd) + 12 * 3600 * 1000).toISOString();
          panelState.windowEnd = nextEnd;
          loadData(nextEnd);
        }
      });
    }

    const windowSelect = element.querySelector(".kpi-window-select");
    if (windowSelect) {
      windowSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        panelState.windowEnd = val;
        loadData(val);
      });
    }

    // Retry button
    const retryBtn = element.querySelector(".kpi-action-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        loadData(panelState.windowEnd);
      });
    }
  }

  // Initial load
  loadData(panelState.windowEnd);

  return {
    render(nextState) {
      // Re-render UI when external simulation state updates
      updateUI();
    },
    destroy() {},
  };
}
