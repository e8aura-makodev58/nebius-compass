# ResponseCompass — demo story (Nebius x NVIDIA, Best Apps and Agents)

**Purpose:** the storyline for the deck (`ResponseCompass-deck` for Nebius) and the three-minute video.
Written before the deck, so each slide and shot serves one beat. **Status:** draft for review (2026-10-26).

## The one-line story

A field report arrives as a few untrusted sentences. Compass turns it into a cited, safety-checked
recommendation, and nothing is dispatched until a person approves it.

## Who it is for

A control-room operator on a semiconductor test floor. Equipment faults arrive as technician
reports, not clean tickets. The operator has to decide who to send and what to try first, using
history that lives in past tickets and in people's heads.

## Beats (target 2:40, hard limit 3:00)

| # | Time | What the judge sees | What it proves | Judging criterion |
|---|---|---|---|---|
| 1 | 0:00–0:15 | Problem card: "Closest is not best. The first fix is often a guess." Then a technician's free-text report: *"Station 12: the transfer keeps stopping short of the end position every few cycles."* | A real, specific problem with a real input format | Impact |
| 2 | 0:15–0:35 | Control-room wall: six live screens (floor map, issues, dispatch, events, Pareto, analytics), one panel per monitor | The app is a complete product for the room, not one screen | Design |
| 3 | 0:35–1:00 | Field reports tile: the operator submits the report. Code resolves the equipment and lists the candidate interpretations (at most 12). The Investigator ranks them; the operator confirms the symptom | Code owns facts; the model only ranks what code supplies; the operator confirms | Technological implementation |
| 4 | 1:00–1:45 | Investigation view: observed past cases cited by ID, fixes ranked with the catalog procedure text quoted verbatim, responders ranked with their qualifications, and the safety prerequisites the operator must tick | Tool-using investigation with evidence and citations, not a bare answer | Technological implementation, Quality of idea |
| 5 | 1:45–2:10 | Central command approves the recommended responder and fix. The audit trail records who approved what | Human approval gate; nothing is dispatched without a record | Design, Impact |
| 6 | 2:10–2:35 | Analytics and Issue Pareto over a simulated month: where the downtime comes from, and first-time fix by class | The history is what the next recommendation learns from | Quality of idea |
| 7 | 2:35–2:50 | Closing card: what is live, what runs on Nemotron on Nebius Token Factory, what code owns, Apache-2.0 and public repo | Honest scope and the required model/infrastructure claims | Stage One (track fit) |

## What must be on screen (rules)

- **Nebius Token Factory and an NVIDIA open-source model** must be visibly in use in the video.
  Nemotron 3 Ultra runs the Investigator; Nemotron 3 Super ranks responders, fixes and overtime; Nemotron
  3.5 Lightning plans events and writes the simulated narratives. The model names appear in Settings, next to the calls they make.
- **Public YouTube video under three minutes.** Upload after recording; link it on the form.
- **Working URL.** The live demo runs on the deployed app. Judges sign in with a guest username and
  the shared password, and each username gets its own workplace.

## Blockers before recording

1. **Nebius Token Factory API key.** Set on the deployed server through `NEBIUS_TOKEN_FACTORY_API_KEY_FILE`
   (the sponsor's token, kept outside git). Checked 2026-10-26: the models endpoint returns 200, and a live
   Nemotron 3 Super call returned a reply. The video must be recorded with providers on, so beats 3–4 show
   real Nemotron output, not fallback output.
2. **Live Nemotron check (N0 probe)** must pass with the key before recording. Captures are
   recorded as saved outputs, never as model output we did not get.

## What we do not claim

- No claim that Nemotron verifies its own prose. Code checks each citation and rejects
  references that the tools did not return.
- No claim of a controlled benchmark. The month is synthetic. Agreement with a baseline is shown,
  disagreements are recorded for review.
- Responder skill and the true fault cause are hidden simulation truth. No screen or model sees them.

## Judging-criteria map

- **Technological implementation:** Token Factory calls with timeouts, a per-provider rate limit and
  circuit breaker; code-owned validators and the dispatch gate; hermetic and Chromium tests.
- **Design:** one product for the room (wall screens, operator console, phone view), keyboard
  navigation, accessible text alternatives.
- **Potential impact:** technician reports are the real input; the approval gate keeps people in
  command.
- **Quality of idea:** the model is asked to rank code-supplied options with cited evidence, not to
  invent facts.

## Open decisions for the reviewer

1. Keep the Investigator as the lead beat (recommended, it is the new Nebius-era feature), or lead
   with the dispatch wall?
2. Figures for beat 6. Checked on 2026-10-26 against the live Analytics screen: September 2026 has 3,004
   issues, a 25% reopen rate over 4,683 observed attempts, and the top two classes make 78% of issues; the 80% line is crossed on the third.
   The old 73.5% first-time-fix figure from the AMD-era deck does not appear on the current screen, so it is
   not used.

## Blocking questions (2026-10-26)

- **Guest workplaces and the Investigator.** Decided 2026-10-26: field reports, investigations and cases are open
  to guest workplaces, paid from the sponsor's Nebius tokens. `/ask` and `/compass` stay closed.
- **Nebius key.** Set on the deployed server and confirmed with a live call on 2026-10-26.
