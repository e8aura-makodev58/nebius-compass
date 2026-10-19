# Nebius theme — Codex input for Gemini

2026-10-19. Supplement to Gemini's round 20g review, requested directly by the user.
The user now wants the enhancement to follow the Nebius color theme; earlier
instructions to retain the exact existing indigo palette should not prevent this.
These are recommendations, not screenshot-confirmed defects or implementation changes.

## Suggested direction

Keep the light operational workspace: white cards, quiet neutral backgrounds,
strong text, local Inter/JetBrains Mono and restrained borders. Apply Nebius color
through the shell, selected controls and a small number of primary actions. The
floor map, hazard indicators and evidence should remain easy to interpret at a glance.

Use the [official Nebius site](https://nebius.com/) and
[media kit](https://nebius.com/media-kit) to establish the palette provenance.
Record the actual sampled/approved values and source in the design proposal;
this note does not assert an official hex palette. Distinguish original brand
colors from application-specific accessible derivatives.

## Priorities for the proposal

1. **Define color roles before replacing tokens (CSS).** `frontend/tokens.css`
   currently gives one indigo accent to selection, links, buttons and focus, with
   white `--on-accent` text. A brighter brand accent may need dark button text,
   a darker text/link derivative and a separate visible focus outline. Propose
   those roles together; include hover, selected, disabled and keyboard states.
   A global hex replacement alone leaves these relationships unresolved.

2. **Separate brand from operational meaning (CSS, plus labels where needed).**
   Keep danger red, caution amber and resolved/available green recognizable.
   If a brand hue resembles a status hue, make selection distinguishable through
   its outline/shape and label. Keep provider identity in the source badge; use
   explicit words for evidence grade, approval and fallback. A branded badge must
   not imply that a recommendation is verified or approved.

3. **Use the Field reports tile as the component reference (mostly CSS).**
   Align its heading, source metadata, chips, disclosure spacing and decision bar
   with Staffing. Lead with the issue, recommendation and decision deadline;
   keep traces and citations accessible below. Preserve the readable untrusted
   report quote and prominent hazard callout. Review `.inv-chip` (`.68rem`) and
   `.inv-actions button` (`.76rem`, 7px vertical padding) on the phone: prioritize
   readable labels and approximately 44px touch targets for important actions.

4. **Keep actions usable inside small tiles (CSS/layout review).**
   `.inv-primary` is sticky within a scrolling tile. Check that the decision bar
   remains visible without covering prerequisites, reason fields or the last
   evidence row at short viewport heights, browser zoom and mobile keyboard
   opening. Keep one visually dominant approval action; make reject/escalate
   easy to find without making every control equally loud.

5. **Carry the palette through all shared views (CSS).**
   Include Dockview active tabs/splitters, floor selection/focus, Settings role
   cards, source chips and wall displays in the token audit. Brand accents should
   not overwhelm the machine/responder map. Keep chart categories distinguishable
   with labels and table access; do not turn every series into a close brand tint.

6. **Validate the decisions, not just the empty screen (review).**
   Capture pending approval, hazard escalation, deterministic fallback, thin/no
   evidence, long model names, read-only settings and unavailable metrics at
   375px, 1280px and 1920px. Include a visible keyboard-focus state and the wall
   investigation view. Check 4.5:1 for normal text and 3:1 for essential control
   boundaries/focus indicators against their adjacent surfaces. Keep status words
   and metric denominators readable. For implementation, run the existing color
   contrast test and both repository suites, then inspect the rendered states.

Suggested delivery: one palette/token-role table, one annotated busy desktop,
one annotated phone decision view, and a short ordered implementation list.
Keep this supplement separate from Gemini's report so it can incorporate or
reject these suggestions without a document edit conflict. Gemini remains the
owner of the visual review and enhancement proposal.
