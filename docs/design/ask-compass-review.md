# Ask Compass Dialog Design Review & Enhancement Plan (October 2026)

This document reviews the user interface, interaction design, keyboard accessibility, and visual styling of the newly implemented **Ask Compass** Q&A feature (`frontend/ask-view.js`, `frontend/investigation.css`).

Visual capture and interactive testing were performed against an isolated preview instance running on port **3122** (`NODE_ENV=test`, `COMPASS_CONTROL_ROOMS_DATA_ROOT=/tmp/compass-gemini-preview`, forced provider failure mode `COMPASS_ASSISTANT_MODE=force-failure`, `COMPASS_LIVE_COMPASS_MODE=force-failure`, `COMPASS_EVENT_PLANNER_MODE=force-failure`) across reference viewports:
- **375×812 px** (mobile / phone workspace)
- **1280×900 px** (standard desktop operations console)
- **1920×1080 px** (command-center display & high-resolution desktop)

---

## 1. What Works

The Ask Compass dialog provides a focused, grounded operational assistant that respects Compass's strict safety and determinism boundaries:

- **Grounded Citation Navigation:** Every record returned in an answer is rendered as an interactive citation chip (`.inv-case`) carrying `data-ask-kind` (`issue`, `analytics`, `responder`, `investigation`, `event`, `case`). Clicking an `issue` citation immediately closes the dialog, switches to the issue, and selects its station; clicking an `analytics` citation transitions directly to `#analytics-view`.
- **Deterministic Refusal & Safety Boundaries:** Action requests (e.g. attempting to dispatch, approve, or execute) and hidden simulation requests are caught deterministically by `declineQuestion()` in `assistant.mjs` and rendered with a distinct `Declined` status chip and read-only guidance.
- **Header Launcher Prominence:** The `#open-ask` launcher button uses the Nebius brand lime accent (`--brand-lime: #D7F443` / `#E1FE3C`) with deep dark ink text (`#0F2B43`), ensuring high contrast (>11:1) and clear discoverability beside the search launcher.
- **Keyboard Traversal & Focus Restoration:** When opening via Enter on `#open-ask`, focus is placed directly in the question `<textarea>`. Pressing `Escape` closes the modal immediately and restores focus to `#open-ask`.
- **Surface Containment:** The modal container (`.ask-dialog`) is well-elevated on `--paper-raised` (`#FFFFFF`) with a semi-opaque backdrop (`rgba(15, 43, 67, .35)`), creating clear visual separation from the operational grid underneath.

---

## 2. Issues Identified

### Issue 1: Scroll Overflow Hides Header and Input on Long Q&A Histories
- **Severity:** Major
- **Screen / Width:** Desktop (`1280px`, `1920px`) and Mobile (`375px`)
- **Screenshot:** [ask-compass-1280.png](ask-compass-review/ask-compass-1280.png)
- **Selector / Location:** `frontend/investigation.css:72` (`.ask-dialog`)
- **Description:** Currently, `overflow: auto` is placed directly on `.ask-dialog`. When multiple questions are asked and `.ask-history` expands (retaining up to 20 answers), scrolling down to inspect past answers scrolls the entire modal body. Consequently, the dialog title, the Close button, and the question `<textarea>` scroll completely out of view. An operator wanting to ask a follow-up question must scroll all the way back up to the top.
- **Concrete Fix:** Turn `.ask-dialog` into a flex column layout with fixed header/form sections and a dedicated scrolling container for `.ask-history`:
  ```css
  .ask-dialog {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    max-height: min(86vh, 900px);
  }
  .ask-head, .ask-form {
    flex-shrink: 0;
  }
  .ask-history, .ask-case {
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 4px;
  }
  ```

---

### Issue 2: Mobile 375px Touch Target Deficiencies (WCAG 2.5.5 Violation)
- **Severity:** Major (Accessibility & Usability)
- **Screen / Width:** Mobile (`375px`)
- **Screenshot:** [ask-compass-375.png](ask-compass-review/ask-compass-375.png)
- **Selector / Location:** `frontend/investigation.css:87` (`#open-ask`), `frontend/investigation.css:74` (`.ask-head button`), `frontend/investigation.css:80` (`.ask-context`)
- **Description:**
  1. `#open-ask` has a computed height of `31px`, falling short of the 44×44px touch target requirement established in `frontend/layout.css` for mobile viewports.
  2. In `.ask-head`, the Close button (`button.secondary-button[data-ask-close]`) has a computed height of `31px` and padding of `8px 14px`, making it prone to mis-taps on small touchscreens.
  3. The `.ask-context` label wraps a small native checkbox (`<input type="checkbox">`) and text at `font-size: .78rem`, yielding an effective interactive touch height of only ~22px.
- **Concrete Fix:** Add mobile touch target sizing overrides under `@media (max-width: 600px)`:
  ```css
  @media (max-width: 600px) {
    #open-ask {
      min-height: 44px;
      padding: 10px 14px;
    }
    .ask-head [data-ask-close] {
      min-height: 44px;
      min-width: 64px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .ask-context {
      min-height: 44px;
      padding: 6px 0;
      font-size: .84rem;
    }
    .ask-context input[type="checkbox"] {
      width: 18px;
      height: 18px;
    }
    .ask-form button[type="submit"] {
      min-height: 44px;
      width: 100%;
    }
  }
  ```

---

### Issue 3: Textarea Keyboard Submission Affordance (Enter Key Handling)
- **Severity:** Minor (Accessibility & Workflow Speed)
- **Screen / Width:** Desktop (`1280px`, `1920px`)
- **Screenshot:** [ask-compass-keyboard-focus.png](ask-compass-review/ask-compass-keyboard-focus.png)
- **Selector / Location:** `frontend/ask-view.js:41`, `frontend/investigation.css:78`
- **Description:** The question input is implemented as a `<textarea rows="2">`. When an operator presses `Enter`, the default browser behavior inserts a newline character rather than submitting the query. The user must manually press `Tab` (which first navigates through the `.ask-context` checkbox if an issue is selected, then to the `Ask` button) before pressing `Enter` to submit. In high-tempo dispatch operations, single-line or brief two-sentence questions benefit from direct keyboard submission.
- **Concrete Markup / JS Fix:** In `frontend/ask-view.js`, add a `keydown` handler on `[data-ask-question]` to submit on `Enter` (without `Shift`), while preserving `Shift+Enter` for multi-line queries:
  ```js
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      field.form?.requestSubmit();
    }
  });
  ```
  Complement with a keyboard shortcut hint microcopy below the textarea: `Press Enter to ask, Shift+Enter for newline`.

---

### Issue 4: Visual Differentiation Between Declined and Fallback Records
- **Severity:** Minor (Visual Hierarchy)
- **Screen / Width:** All Viewports (`375px`, `1280px`, `1920px`)
- **Screenshot:** [ask-compass-1280.png](ask-compass-review/ask-compass-1280.png)
- **Selector / Location:** `frontend/investigation.css:83`
- **Description:** Rule `.ask-answer.ask-declined, .ask-answer.ask-fallback` groups both states together:
  `border-left-color: var(--rule-strong); background: var(--paper-sunk);`
  However, `DECLINED` represents an intentional safety guardrail enforcement (action request or hidden simulation truth refusal), whereas `FALLBACK` represents an operational response that succeeded via deterministic public record summarization. Giving both states the same muted grey left border (`#CDD5DF`) obscures the distinction between an operational fallback and a safety refusal.
- **Concrete Fix:** Separate the two states and bind `.ask-declined` to the warning amber border:
  ```css
  .ask-answer.ask-declined {
    border-left-color: var(--warn);
    background: var(--paper-sunk);
  }
  .ask-answer.ask-fallback {
    border-left-color: var(--rule-strong);
    background: var(--paper-sunk);
  }
  .ask-answer.ask-ready {
    border-left-color: var(--accent);
    background: var(--paper-raised);
  }
  ```

---

### Issue 5: Unstyled Case Detail Drilldown Container
- **Severity:** Minor (Visual Consistency)
- **Screen / Width:** Desktop (`1280px`, `1920px`)
- **Selector / Location:** `frontend/investigation.css:86` (`.ask-case`)
- **Description:** When an operator clicks a case citation (`<button data-ask-kind="case">`), `ask-view.js` renders `.ask-case` in place of `.ask-history`. In `investigation.css`, `.ask-case { display: grid; gap: 6px; }` has no internal padding, border, or background container. It sits flush against the form divider without visual grounding, contrasting with other structured cards across the application (`.inv-card`).
- **Concrete Fix:** Enclose `.ask-case` in an elevated recessed container:
  ```css
  .ask-case {
    display: grid;
    gap: 8px;
    padding: 14px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--paper-sunk);
  }
  .ask-case h4 {
    margin: 0;
    font-size: .92rem;
    color: var(--ink);
  }
  ```

---

## 3. Five CSS-Only Improvements (Nebius Palette)

All proposed enhancements strictly adhere to the Nebius palette guidelines:
- Deep dark ink: `var(--ink: #0F2B43)`
- Muted secondary ink: `var(--ink-2: #3B5064)`
- Brand lime accent: `var(--brand-lime: #E1FE3C)` (used strictly as surface/accent fill, **never** as text)
- Deep lime hover fill: `var(--brand-lime-deep: #C8E82E)`
- Clean raised surface: `var(--paper-raised: #FFFFFF)`
- Recessed surface: `var(--paper-sunk: #E4EAF1)`
- Borders: `var(--rule: #D8E0EA)`, `var(--rule-strong: #BF CAD8)`
- Primary accent: `var(--accent: #0F2B43)` / indigo tint `var(--accent-wash: #EEF2F6)`

---

### Improvement 1: Docked Header & Form with Scrollable History Pane
- **Rationale:** Ensures that the prompt input and Close action remain permanently in view regardless of how long the room's question history becomes.
```css
/* 1. Flex container containment with isolated scrollable history */
.ask-dialog {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: min(88vh, 880px);
}

.ask-head,
.ask-form {
  flex-shrink: 0;
}

.ask-history,
.ask-case {
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 6px;
  margin-top: 4px;
}
```

---

### Improvement 2: Semantic Left-Border Signals for Answer Classifications
- **Rationale:** Provides instant visual orientation on whether an answer is a verified model response (`--accent`), a deterministic record fallback (`--rule-strong`), or a safety refusal (`--warn`).
```css
/* 2. Semantic state distinction across answer cards */
.ask-answer {
  position: relative;
  transition: border-color .15s ease, background-color .15s ease;
}

.ask-answer.ask-ready {
  border-left: 3px solid var(--accent);
  background: var(--paper-raised);
}

.ask-answer.ask-declined {
  border-left: 3px solid var(--warn);
  background: var(--paper-sunk);
}

.ask-answer.ask-fallback {
  border-left: 3px solid var(--rule-strong);
  background: var(--paper-sunk);
}
```

---

### Improvement 3: Interactive Polish & Focus Rings on `#open-ask` Header Button
- **Rationale:** Gives the header trigger a clear tactile feel and high-contrast focus indicator matching the primary search launcher.
```css
/* 3. Header button hover and focus states with Nebius lime fill */
#open-ask {
  background: var(--brand-lime);
  color: var(--ink);
  border-color: var(--ink);
  font-weight: 600;
  transition: background-color .15s ease, border-color .15s ease, box-shadow .15s ease;
}

#open-ask:hover {
  background: var(--brand-lime-deep);
  border-color: var(--ink);
  box-shadow: var(--shadow-sm);
}

#open-ask:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-color: var(--accent);
}
```

---

### Improvement 4: Citation Chip Elevation and Interactive Affordance
- **Rationale:** Citation buttons (`.inv-case`) represent actionable navigation jumps. Adding subtle elevation and hover translation clearly differentiates them from static status chips.
```css
/* 4. Enhanced interactive citation chips */
.ask-answer .inv-case {
  background: var(--paper-raised);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  box-shadow: 0 1px 2px rgba(15, 43, 67, .06);
  padding: 3px 9px;
  font: 600 .74rem var(--font-mono);
  transition: transform .12s ease, background-color .12s ease, border-color .12s ease;
}

.ask-answer .inv-case:hover {
  background: var(--accent-wash);
  border-color: var(--accent);
  color: var(--accent-ink);
  transform: translateY(-1px);
}

.ask-answer .inv-case:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}
```

---

### Improvement 5: Mobile Ergonomics & Responsive Form Budget (`@media (max-width: 600px)`)
- **Rationale:** Adapts dialog geometry and touch zones to smaller handheld devices, preventing off-screen overflow and enabling effortless tapping.
```css
/* 5. Mobile responsive layout and touch targets */
@media (max-width: 600px) {
  .ask-dialog {
    width: calc(100vw - 16px);
    max-height: 92vh;
    padding: 14px 12px;
    border-radius: var(--radius-sm);
  }

  .ask-head h2 {
    font-size: 1rem;
  }

  .ask-head [data-ask-close] {
    min-height: 44px;
    padding: 8px 12px;
  }

  .ask-form textarea {
    font-size: 16px; /* Prevents iOS Safari auto-zoom on focus */
    padding: 10px;
  }

  .ask-form button[type="submit"] {
    min-height: 44px;
    width: 100%;
    font-size: .88rem;
  }

  .ask-context {
    min-height: 40px;
    font-size: .82rem;
  }

  .ask-answer {
    padding: 8px 10px;
  }

  .ask-answer .inv-case {
    min-height: 32px;
    padding: 4px 10px;
  }
}
```

---

## 4. Verification & Cleanliness

- **Port Verification:** Preview server was tested exclusively on port `3122` and cleanly stopped; verified `ss -ltn | grep :3122` reports zero active listeners.
- **Suite Verification:** No code changes were made to `frontend/`, `backend/`, or `e2e/`. Verification relies on visual inspection and recorded Playwright traces across 375px, 1280px, and 1920px.
- **Screenshots:** Exactly 4 reference screenshots are committed under `docs/design/ask-compass-review/` totaling 596 KB (well below repository budgets).
