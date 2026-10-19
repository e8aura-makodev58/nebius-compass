# ResponseCompass Theme Review & Enhancement Plan (October 2026)

This document reviews the visual design and implementation of ResponseCompass following the integration of the modern light design system, the operational UI refinements, the Dockview tiling system, and the newly added **Field reports / Compass Investigator** tile.

Testing and visual capture were conducted against a local preview instance on isolated port **3122** (`NODE_ENV=test`, `COMPASS_CONTROL_ROOMS_DATA_ROOT=/tmp/compass-gemini-preview`, forced provider failure mode) across three reference viewports: **375×812 px** (mobile), **1280×900 px** (desktop standard), and **1920×1080 px** (high-resolution desktop & command-center wall displays).

---

## 1. What Works

The modern light system successfully transitions ResponseCompass from high-contrast industrial wireframes into a refined, production-grade operations console. Key strengths observed in testing include:

- **Surface and Background Palette:** The foundational pairing of cool-grey page background (`--paper: #F4F6FA`) with crisp white elevated surfaces (`--paper-raised: #FFFFFF`) and soft recessed fills (`--paper-sunk: #EDF0F5`) creates clean structural containment for data-heavy views without visual clutter.
- **Typography & Font Pairing:** The local variable fonts—Inter Variable for headings and interface labels, and JetBrains Mono Variable for machine IDs, timestamps, issue codes, and metrics—provide immediate semantic hierarchy and crisp rendering at all densities.
- **Dockview Tiling Integration:** On desktop (1280px and 1920px), Dockview seamlessly organizes the six distinct functional zones (Floor map, Issues queue, Event feed, Dispatch / Context, Staffing, and Field reports). Splitter controls are understated, and panel headers maintain clean distinction.
- **Phone Workspace Usability:** On mobile (375px), switching to a 4-tab segmented workspace (`Issues`, `Floor`, `Decisions`, `Events`) prevents information overload. The badge counters (e.g. `Issues 3`, `Decisions 1`) provide high-level situational awareness without requiring deep scrolling.
- **Semantic Status Signals:** Operational status colors (danger red for active alarms, warning amber for pending/moderate, green for resolved/available, and indigo for primary actions) are applied strictly for state indicators and chips, avoiding decorative overuse.

---

## 2. Issues Identified

### Issue 1: Header Alignment & Empty-State Inconsistency in the Field Reports Tile
- **Severity:** Major
- **Screen / Width:** Live Floor desktop (`1280px` & `1920px`)
- **Screenshot:** [field-reports-investigation-1280.png](theme-review-2026-10/field-reports-investigation-1280.png)
- **Selector / Location:** `frontend/investigation.css:54-55`, `frontend/investigation-view.js:15`
- **Description:** In `investigation.css`, `#floor-tiles .investigation-tile .inv-tile-head h3 { display: none; }` hides the `<h3>` title because the Dockview tab already names the panel. However, `#floor-tiles .investigation-tile .inv-tile-head` retains `justify-content: flex-end; margin-bottom: 8px;`, placing the "Report incident" button alone on an otherwise empty header row. Meanwhile, adjacent tiles (such as Staffing) embed their action controls directly within the tile body or footer without leaving an empty top row. In addition, the Field Reports empty state card uses `border: 1px dashed var(--rule);` with different internal padding compared to Staffing's `border: 1px dashed var(--rule-strong);`.
- **Concrete Fix:**
  - Standardize empty state cards across both tiles:
    ```css
    .inv-card.empty, .staffing-empty {
      background: var(--paper-sunk);
      border: 1px dashed var(--rule-strong);
      border-radius: var(--radius);
      padding: 14px;
    }
    ```
  - Integrate the "Report incident" button into a compact header bar or dock it inline with the list controls to eliminate the redundant 36px top gap.

---

### Issue 2: Low Contrast on Microcopy & Auxiliary Metadata (WCAG AA Risk)
- **Severity:** Major (Accessibility)
- **Screen / Width:** Desktop (`1280px`, `1920px`) and Mobile (`375px`)
- **Screenshot:** [field-reports-investigation-1280.png](theme-review-2026-10/field-reports-investigation-1280.png), [wall-display-investigation-1920.png](theme-review-2026-10/wall-display-investigation-1920.png)
- **Selector / Location:** `frontend/investigation.css:17`, `frontend/investigation.css:28`, `frontend/tokens.css:15`
- **Description:** `.inv-meta` and `.inv-option small` use `color: var(--ink-3); font-size: .72rem;` (~11.5px). In `tokens.css`, `--ink-3` is `#566274`. When rendered against `--paper-sunk` (`#EDF0F5`) or `--accent-wash` (`#EEF0FF`), the contrast ratio is ~4.3:1. Because the text is small (under 14pt / 18.5px normal), WCAG 2.1 AA requires at least 4.5:1. Auxiliary labels such as "No cited case", "Fallback: forced-failure", and timestamps fail this threshold.
- **Concrete Fix:**
  - Use `--ink-2` (`#475467`, contrast ratio > 4.9:1) for sub-14px microcopy:
    ```css
    .inv-meta, .inv-option small, .inv-row span {
      color: var(--ink-2);
      font-size: .78rem; /* 12.5px */
    }
    ```
  - Reserve `--ink-3` strictly for inactive tab text or large non-textual indicators.

---

### Issue 3: Incident Narrative Block Styled as Quote Rather Than Operational Dispatch
- **Severity:** Minor
- **Screen / Width:** Desktop (`1280px`) and Mobile (`375px`)
- **Screenshot:** [field-reports-investigation-1280.png](theme-review-2026-10/field-reports-investigation-1280.png)
- **Selector / Location:** `frontend/investigation.css:16`
- **Description:** `.inv-narrative` renders submitted operator text with `font-style: italic; border-left: 3px solid var(--rule-strong); background: var(--paper-sunk); color: var(--ink);`. The italicized text with a faint grey border mimics a blog citation or quote block rather than a high-priority operational incident record.
- **Concrete Fix:**
  - Remove `font-style: italic;` and introduce an explicit semantic accent border and metadata tag:
    ```css
    .inv-narrative {
      margin: 4px 0 8px;
      padding: 10px 12px;
      border-left: 3px solid var(--accent);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      background: var(--paper-sunk);
      color: var(--ink);
      font-style: normal;
      font-size: .82rem;
      line-height: 1.5;
    }
    ```

---

### Issue 4: Wall Display Fullscreen Density & Excessive Line Measure on 1920×1080
- **Severity:** Major
- **Screen / Width:** Wall display (`1920px`) at `/rooms/plant-1/display/investigation`
- **Screenshot:** [wall-display-investigation-1920.png](theme-review-2026-10/wall-display-investigation-1920.png)
- **Selector / Location:** `frontend/layout.css` (`.display-mode`), `frontend/investigation.css`
- **Description:** In wall display mode, `#investigation-tile` spans the entire 1920px screen width. Detailed procedural instructions (e.g. "Compare the reference settings with the operating checklist...") stretch across up to 1860px in a single line at `.8rem` font size. On a wall-mounted monitor viewed from 2–3 meters away, 12px typography is unreadable, and an 1800px line measure violates basic typographic ergonomics (optimal reading measure is 60–85 characters).
- **Concrete Fix:**
  - Add responsive wall display layout constraints:
    ```css
    .display-mode #investigation-tile {
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px;
      font-size: 1rem;
    }
    .display-mode .inv-detail {
      display: grid;
      grid-template-columns: minmax(360px, 1fr) minmax(420px, 1.2fr);
      gap: 20px;
      align-items: start;
    }
    .display-mode .inv-detail h4, .display-mode .inv-heading {
      font-size: 1.2rem;
    }
    ```

---

### Issue 5: Mobile Viewport Height Budgeting & Desktop Keybinding Leak
- **Severity:** Minor
- **Screen / Width:** Mobile (`375px`)
- **Screenshot:** [live-floor-375.png](theme-review-2026-10/live-floor-375.png), [field-reports-investigation-375.png](theme-review-2026-10/field-reports-investigation-375.png)
- **Selector / Location:** `frontend/ops.css`, `frontend/layout.css`
- **Description:** On a 375×812 px mobile screen:
  1. The top header stack (control room status, simulation time, speed selector, Resume/Reset buttons), search launcher (`Find in Control Room / · ⌘K`), Screens dropdown, and 4-tab workspace bar together occupy ~350px—more than 43% of the entire screen height before any issue or decision card is displayed.
  2. The search button renders `⌘K` on mobile touchscreens where no physical keyboard or command key exists.
- **Concrete Fix:**
  - In `@media (max-width: 900px)`:
    - Hide the keyboard accelerator badges:
      ```css
      .search-shortcut-badge, .search-keybind { display: none; }
      ```
    - Compact the simulation status into a single horizontal flex row.
    - Reduce vertical padding in the phone workspace switcher (`.phone-nav-btn { padding: 6px 10px; font-size: .8rem; }`), recovering over 90px of vertical space for operational lists.

---

### Issue 6: KPI Card Vertical Alignment & Sunk Data Contrast in Analytics
- **Severity:** Minor
- **Screen / Width:** Analytics desktop (`1280px`)
- **Screenshot:** [analytics-1280.png](theme-review-2026-10/analytics-1280.png)
- **Selector / Location:** `frontend/analytics.css:12-25`
- **Description:** In the top KPI grid (`Active issues 3`, `Open downtime 25 min`, `Reopen rate —`, `Compass recommendations 0`), the cards have slightly uneven internal flex distributions when unit strings (`min`) wrap or sit beside values. Additionally, in the Pareto and Issue Lifecycle charts, incomplete/in-progress simulated periods use `--chart-other` (`#9AA4B2`) as a heavy solid bar, visually competing with resolved issue categories.
- **Concrete Fix:**
  - Standardize KPI card layouts with explicit flex column alignment:
    ```css
    .kpi-card {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 104px;
    }
    .kpi-card .unit {
      font-size: .9rem;
      color: var(--ink-2);
      font-weight: 500;
      margin-left: 4px;
    }
    ```
  - Render in-progress chart bars with a diagonal hatch or 40% alpha wash (`rgba(154, 164, 178, 0.4)`) to clearly communicate provisional data.

---

### Issue 7: Data Table Scanability in Settings Usage Card
- **Severity:** Minor
- **Screen / Width:** Desktop (`1280px`) and Mobile (`375px`)
- **Screenshot:** [settings-api-1280.png](theme-review-2026-10/settings-api-1280.png)
- **Selector / Location:** `frontend/ops.css` (`.settings-usage-table`)
- **Description:** The Usage table inside Settings → API lists token counts and API calls across roles. Numeric columns (`Calls`, `Input tokens`, `Output tokens`) lack right alignment and tabular numeral formatting, making column comparison difficult across wide desktop cards. On mobile (375px), 4 columns crowd the card horizontally.
- **Concrete Fix:**
  - Right-align numeric columns and enforce tabular figures:
    ```css
    .settings-usage-table th:not(:first-child),
    .settings-usage-table td:not(:first-child) {
      text-align: right;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
    }
    .settings-usage-table tr {
      border-bottom: 1px solid var(--rule);
    }
    ```

---

### Issue 8: Focus Ring Visibility on Cited Case Chips and Accordion Summaries
- **Severity:** Minor (Accessibility & Keyboard Nav)
- **Screen / Width:** All viewports
- **Screenshot:** [field-reports-investigation-1280.png](theme-review-2026-10/field-reports-investigation-1280.png)
- **Selector / Location:** `frontend/investigation.css:22`, `frontend/investigation.css:47`
- **Description:** `.inv-case` chips (e.g. `CASE-102`) and `<details> <summary>` disclosures have `cursor: pointer;` but do not declare an explicit `:focus-visible` pseudo-class. Keyboard users navigating via Tab cannot reliably tell when a case chip or details toggle has focus.
- **Concrete Fix:**
  - Apply the shared design token `--focus-ring` consistently:
    ```css
    .inv-case:focus-visible,
    .investigation-tile summary:focus-visible,
    .inv-row:focus-visible,
    .inv-option:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
      border-color: var(--accent);
    }
    ```

---

## 3. Enhancement Plan

The following enhancements are prioritized by operational value versus implementation effort. All items preserve the modern light visual identity, use existing CSS variables, and maintain offline-first operability (no external fonts, CDNs, or frameworks).

| # | Item | Value / Effort | CSS-only? | Target Area |
|---|---|---|---|---|
| **E1** | **Standardized Tile Empty States & Header Docks** | High / Low | **Yes** | `frontend/investigation.css`, `frontend/ops.css` |
| **E2** | **WCAG AA Microcopy Contrast & Scale Adjustment** | High / Low | **Yes** | `frontend/investigation.css`, `frontend/panel.css` |
| **E3** | **Wall Display Ergonomic Two-Column Layout (1920px)** | High / Medium | **Yes** | `frontend/layout.css`, `frontend/investigation.css` |
| **E4** | **Mobile Header Compaction & Touchscreen Optimization** | High / Medium | No (minor markup) | `frontend/index.html`, `frontend/layout.css`, `frontend/ops.css` |
| **E5** | **Field Incident Narrative & Cited Case Chip Redesign** | Medium / Low | **Yes** | `frontend/investigation.css` |
| **E6** | **Tabular Numeral & Grid Alignment for Settings Usage** | Medium / Low | **Yes** | `frontend/ops.css` |
| **E7** | **Universal Focus-Visible Halo Across Interactive Elements** | Medium / Low | **Yes** | `frontend/base.css`, `frontend/investigation.css` |
| **E8** | **In-Progress Simulated Activity Styling in Charts** | Low / Low | **Yes** | `frontend/analytics.css` |

### Detailed Execution Recommendations

1. **E1 (Empty States):** Create a shared `.tile-empty-card` utility rule in `panel.css` or `base.css` that binds Field reports, Staffing, and Context panel empty states to identical 14px padding, `--paper-sunk` fill, and `--rule-strong` dashed borders.
2. **E2 (Contrast Hardening):** Replace `--ink-3` with `--ink-2` on all secondary card labels and raise sub-12px microcopy to `.78rem` (12.5px).
3. **E3 (Wall Display):** In `.display-mode`, apply CSS grid to divide wide viewports (≥1440px) into a two-column operational layout, preventing long single-line text runs and boosting font size to 16px.
4. **E4 (Mobile Polish):** Hide desktop-only shortcut chips (`⌘K`) below 900px and reduce header button padding so operators immediately see the queue on mobile.
5. **E5 (Narrative Polish):** Remove italics from `.inv-narrative`, use a solid indigo left border, and give cited case chips (`.inv-case`) distinct background hover and focus rings.
6. **E6 (Tabular Figures):** Right-align numeric columns in the Settings Usage table with `font-variant-numeric: tabular-nums` and add subtle row border lines.
7. **E7 (Keyboard Accessibility):** Ensure all clickable chips, options, and summary elements declare `:focus-visible { box-shadow: var(--focus-ring); }`.
8. **E8 (Chart Aesthetics):** Style provisional/in-progress simulated period chart bars with a distinct pattern or reduced opacity so they are never mistaken for completed historical aggregates.

---

## 4. Referenced Captures

The following captures are committed under `docs/design/theme-review-2026-10/` (total size ~1.2 MB, well within the 3 MB repository budget):

- [live-floor-1280.png](theme-review-2026-10/live-floor-1280.png) — Desktop Live Floor with Dockview tiling and empty Field Reports tile.
- [field-reports-investigation-1280.png](theme-review-2026-10/field-reports-investigation-1280.png) — Desktop Live Floor showing confirmed report and opened investigation details.
- [live-floor-1920.png](theme-review-2026-10/live-floor-1920.png) — High-resolution desktop 1920px Live Floor view.
- [field-reports-investigation-1920.png](theme-review-2026-10/field-reports-investigation-1920.png) — 1920px desktop view with open investigation.
- [wall-display-investigation-1920.png](theme-review-2026-10/wall-display-investigation-1920.png) — Dedicated wall display screen (`/rooms/plant-1/display/investigation`) at 1920×1080.
- [live-floor-375.png](theme-review-2026-10/live-floor-375.png) — Mobile phone 375px view showing Issues workspace.
- [field-reports-investigation-375.png](theme-review-2026-10/field-reports-investigation-375.png) — Mobile phone 375px view showing Decisions workspace with open investigation.
- [analytics-1280.png](theme-review-2026-10/analytics-1280.png) — Operational Analytics tab with Pareto and KPI cards.
- [analytics-375.png](theme-review-2026-10/analytics-375.png) — Mobile Analytics view.
- [settings-api-1280.png](theme-review-2026-10/settings-api-1280.png) — Settings API tab showing credentials, model configuration, and Usage table.
- [settings-demo-1280.png](theme-review-2026-10/settings-demo-1280.png) — Settings Demo tab showing policy and simulation controls.
- [settings-api-375.png](theme-review-2026-10/settings-api-375.png) — Mobile Settings API view.
