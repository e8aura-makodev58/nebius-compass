# ResponseCompass — Judge Walkthrough & README Verification Report

This document records an end-to-end audit of the onboarding and testing experience for hackathon judges following `README.md` and `docs/nebius/06_SUBMISSION_DRAFT.md` from a fresh git clone.

- **Date:** 2026-10-19
- **Auditor:** Gemini Worker Agent (Round 23g)
- **Environment:** Ubuntu Linux x86_64, Node.js v24.22.0, npm 11.7.0, Chromium (Playwright 1.56.1)
- **API Spending:** $0.00 (No `NEBIUS_TOKEN_FACTORY_API_KEY` set; tested pure deterministic fallback resilience)
- **Target Git Revision:** `7238a08` (`master`)

---

## 1. Numbered Step-by-Step Execution Log

Every command was executed in a clean scratch directory (`.cache/judge-clone`) cloned directly from the integration repository.

### Step 1: Fresh Repository Clone
- **Command:** `git clone /home/makodev58/nebius-compass .cache/judge-clone`
- **Duration:** 0.25 s
- **Outcome:** Clean working tree at commit `7238a08` on branch `master`.

### Step 2: Clean Dependency Installation
- **Command:** `npm ci`
- **Duration:** 0.584 s
- **Outcome:** Success. 43 packages installed; 0 vulnerabilities reported.

### Step 3: Hermetic Automated Test Suite
- **Command:** `npm test`
- **Duration:** 35.615 s
- **Outcome:** **100% Pass** (450 tests passed, 0 failed across 34 test suites).
- **Log Summary:** Zero network calls; zero persistent writes to `backend/data/`.

### Step 4: End-to-End Playwright Browser Verification
- **Command:** `COMPASS_E2E_PORT=3022 LD_LIBRARY_PATH=/home/makodev58/nebius-tools/libs/usr/lib/x86_64-linux-gnu npm run test:e2e`
- **Duration:** 2 min 34.585 s
- **Outcome:** **100% Pass** (85 tests passed, 0 failed across 10 spec files).
- **Log Summary:** Server spun up on port 3022, verified forced provider failure fallbacks, mobile viewports, docking layout, wall-display screens, and torn down cleanly.

### Step 5: Month-Backed Demo Data Bootstrap
- **Command:**
  ```sh
  COMPASS_HOST=127.0.0.1 COMPASS_PORT=3122 COMPASS_DATA_DIR=.cache/judge-demo COMPASS_BOOTSTRAP_DEMO_SEED=true node backend/src/server.mjs
  ```
- **Duration:** 2,092 ms (Bootstrap ingestion + server listen ready in 2,089 ms).
- **Outcome:** Successfully extracted and initialized 30 days of simulation history from `backend/seed/plant-1-month.json.gz`. `GET /api/control-rooms` responded with HTTP 200 within 2.1 s.

### Step 6: Interactive Judge Walkthrough (`docs/nebius/06_SUBMISSION_DRAFT.md`)

All steps performed against `http://127.0.0.1:3122` via Playwright Chromium automation:

#### 6A. Control Room Selection
- **Action:** Open root URL `http://127.0.0.1:3122/` and select **e8-aura-p1**.
- **Duration:** 640 ms (root picker) + 1,737 ms (room load).
- **Observation:** Root picker shows `e8-aura-p1 (Plant 1) · LIVE · Paused`. Clicking the card navigates to `/rooms/plant-1`. The room loads immediately into the Live Floor workspace with simulation time paused at `2026-10-06 08:00`. The state button reads `Resume`.

#### 6B. Station 12 Incident Report
- **Action:** In the **Field reports** tile, click **Report incident**, enter narrative:
  > `"Station 12: the transfer keeps stopping short of the end position every few cycles"`
  and click **Submit report**.
- **Duration:** 1,037 ms.
- **Outcome:** Report `FR-0001` created in `Needs confirmation` status.
- **UI Feedback:** Displays `FR-0001 · Needs confirmation` with badge `Deterministic`. Interpretation prompt reads:
  > *"Confirm what this report is about. Code built these options; Compass only ordered them."*
  Matching candidate options listed for Station 12 (Transfer mechanism).

#### 6C. Interpretation Confirmation
- **Action:** Click **Confirm and investigate**.
- **Duration:** 1,627 ms.
- **Outcome:** Investigation `INV-0001 · ISS-3635` created with status `Awaiting central command · Strong evidence`.
- **UI Details:**
  - Status badge: `Deterministic`
  - Fallback metadata: `Fallback: provider-error`
  - Deadline notice: `Decision due by 08:30 simulated (30 min left) · expires if unanswered`
  - Recommended first action: `Align the guide (FIX-B-02) · Specialist only`
  - Safety prerequisites displayed: 2 checkboxes (`isolation`, `specialist b`).
  - Responders: Qualified responder `R-C-374` pre-selected.

#### 6D. Safety Prerequisite Check & Dispatch Approval
- **Action:** Verify initial state of **Approve and dispatch** button (`disabled = false` when prerequisites not yet checked? No, button is strictly disabled until prerequisites are checked). Checked both safety checkboxes:
  1. `isolation`
  2. `specialist b`
  Click **Approve and dispatch**.
- **Duration:** 110 ms.
- **Outcome:** Status immediately transitions to `Approved by central command · Strong evidence`.
- **Decision Record:** Displays `Approved by central command · Central command · 2026-10-06 08:00 · R-C-374 · FIX-B-02`.

#### 6E. Hazard Escalation Screening
- **Action:** Click **Report incident**, enter narrative with potential hazard:
  > `"Station 8: saw light smoke near the drive motor"`
  and click **Submit report**.
- **Duration:** 102 ms.
- **Outcome:** Immediate escalation without any model inference!
- **UI Details:**
  - Investigation `ISS-3636` created in status `Escalated — safety · No evidence`.
  - Alert callout: `Escalated — safety — Hazard policy requires operator escalation. Nothing is dispatched automatically. Central command may dispatch manually with an audited reason, re-investigate, or close the report.`
  - Chip indicator: `Hazard: smoke`.
  - Audited manual dispatch section provided via `<details class="inv-override">`.

#### 6F. Simulation Unpause / Stepping
- **Action:** Click **Resume**.
- **Duration:** 87 ms.
- **Outcome:** State button toggles from `Resume` to `Pause`. Clock advances from `2026-10-06 08:00` to `2026-10-06 08:03` simulated time as events execute.

---

## 2. Deterministic / Fallback User Experience Assessment

When a judge evaluates ResponseCompass without providing a Nebius Token Factory API key:

1. **Transparency & Labelling:**
   - Every model-capable card renders an unambiguous source badge: `Deterministic`.
   - The investigation detail explicitly renders `Fallback: provider-error`.
   - The user is never misled into thinking a live LLM was invoked when operating offline or uncredentialed.

2. **Functional Completeness:**
   - All deterministic safety policies remain active:
     - Lexical keyword screening intercepts hazards (`smoke`, `heat`, `spark`) instantly in application code.
     - Procedure catalog lookups match symptoms (`B-STOP`) to historical cases and certified fixes.
     - Strict prerequisite enforcement requires human sign-off on lockout/tagout (`isolation`) and role certification (`specialist b`).
     - Simulation state progression, time stepping, and audit journaling continue without interruption.

3. **Clarity Score:**
   - **High.** The distinction between live model ranking and deterministic rule-based fallback is clean, obvious, and preserves all safety invariants.

---

## 3. Numbered Issues & Recommendations

The walkthrough revealed 6 friction points where a judge could be confused or encounter port collisions:

### Issue 1: Default Port 3000 Collision & Missing Port Flag in Quickstart
- **Severity:** Medium
- **Location:** `README.md` lines 144, 149, 156
- **Problem:** `npm run dev` and the demo seed command default to port 3000 (`0.0.0.0:3000`). On multi-user systems, developer laptops, or container hosts, port 3000 is frequently occupied by other services. While the README mentions `COMPASS_PORT` in prose on line 156, the copy-paste snippet does not include it.
- **Replacement:**
  In `README.md` lines 147–150:
  ```markdown
  ```sh
  # Optional month-backed demonstration, using a new isolated data directory.
  # (Override COMPASS_PORT if port 3000 is in use, e.g. COMPASS_PORT=3100)
  COMPASS_DATA_DIR="$PWD/.cache/judge-demo" COMPASS_BOOTSTRAP_DEMO_SEED=true COMPASS_PORT=3000 npm run dev
  ```
  ```

### Issue 2: "Choose control room e8-aura-p1 → Live Floor" Implies Non-Existent Extra Click
- **Severity:** Low (User Confusion)
- **Location:** `docs/nebius/06_SUBMISSION_DRAFT.md` line 115
- **Problem:** The testing instructions state: `choose control room e8-aura-p1 → Live Floor`. A judge clicking `e8-aura-p1` from the room picker lands directly on `/rooms/plant-1` where the Live Floor is already the active default tab. Looking for an additional "Live Floor" button causes unnecessary hesitation.
- **Replacement:**
  In `docs/nebius/06_SUBMISSION_DRAFT.md` line 115:
  ```markdown
  ⟨Open the demo URL → choose control room e8-aura-p1 (which opens the Live Floor directly). In the Field reports panel
  ```

### Issue 3: Hazard Report Submission Does Not Auto-Select the Newly Escalated Incident
- **Severity:** Medium (Usability / Expectation Mismatch)
- **Location:** `docs/nebius/06_SUBMISSION_DRAFT.md` lines 118–119
- **Problem:** After submitting the smoke hazard report, the backend confirms the hazard and creates an `ESCALATED` investigation. However, the UI detail panel remains focused on the previously selected/approved investigation (`ISS-3635`). The new hazard investigation appears as a row `ISS-3636 Escalated — safety` in the Field reports list navigation on the left, but is not automatically selected. A judge may think the submission did nothing unless instructed to click the new item in the list.
- **Replacement:**
  In `docs/nebius/06_SUBMISSION_DRAFT.md` line 118–119:
  ```markdown
  Try a hazard report ("…light smoke near the drive") and select the new incident in the Field reports list to see it escalate without a model call.
  ```

### Issue 4: Clarity on Expected Fallback Badges When No API Key Is Provided
- **Severity:** Low (Documentation Clarity)
- **Location:** `README.md` lines 169–171
- **Problem:** Judges evaluating without an API key see badges labeled `Deterministic` and `Fallback: provider-error`. Line 169 says: *"Missing credentials or failed inference use the applicable deterministic fallback."* It does not explain that `Fallback: provider-error` in the investigation details is the standard indicator of this offline mode. A judge might think the software crashed or misconfigured.
- **Replacement:**
  In `README.md` line 171, add:
  ```markdown
  When running without an API key, reports and investigations will show a `Deterministic` badge with `Fallback: provider-error` in the details. This is the intended offline fallback: all rule-based symptom matching, procedure safety requirements, and dispatch workflows remain 100% functional.
  ```

### Issue 5: Explicit Prerequisite Checkbox Guidance for Approval
- **Severity:** Low (Guidance)
- **Location:** `docs/nebius/06_SUBMISSION_DRAFT.md` line 117–118
- **Problem:** The instruction says *"tick the safety prerequisites and approve"*. In the UI, the **Approve and dispatch** button is disabled with HTML `disabled` until all prerequisite checkboxes (e.g., `isolation`, `specialist b`) are checked. Adding a note that all prerequisite checkboxes must be checked to enable the button prevents confusion.
- **Replacement:**
  In `docs/nebius/06_SUBMISSION_DRAFT.md` line 117–118:
  ```markdown
  Confirm the suggested interpretation, open the investigation, tick all safety prerequisite checkboxes to enable the button, and approve.
  ```

### Issue 6: E2E Command in README Needs Port Conflict Warning
- **Location:** `README.md` line 258
- **Problem:** `npm run test:e2e` defaults to port 3000. If a judge already started the dev server on port 3000 via `npm run dev` in another terminal, `npm run test:e2e` fails with port in use.
- **Replacement:**
  In `README.md` line 258:
  ```markdown
  ```sh
  # If port 3000 is occupied by a running dev server, specify an alternate port:
  COMPASS_E2E_PORT=3022 npm run test:e2e
  ```
  ```

---

## 4. Verification Check off
- [x] Fresh git clone builds cleanly (`npm ci` in 0.58 s)
- [x] Unit test suite passes 100% hermetically (450/450 tests in 35.6 s)
- [x] Playwright E2E suite passes 100% on Chromium (85/85 tests in 2m 34s)
- [x] Month-backed seed bootstraps in 2.09 s
- [x] Incident reporting and deterministic symptom matching verified
- [x] Procedure prerequisite safety gating verified
- [x] Hazard escalation policy verified (instant escalation on `smoke`)
- [x] Simulation clock controls and stepping verified
- [x] Zero API key requirement verified (deterministic resilience intact)
