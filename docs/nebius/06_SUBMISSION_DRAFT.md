# Submission draft — Nebius x NVIDIA Global AI Hackathon

**Status:** draft v1 (main agent, 2026-10-19). Fill the blanks marked ⟨…⟩ before filing.
Every claim below must stay true at submission time. Re-check numbers against
`docs/evaluation.md` and `HACKATHON_CHANGES.md` after the final live run.

## Track

**Best Apps and Agents.**

## Project name

ResponseCompass: an operations control-room agent on NVIDIA Nemotron

## Short description

ResponseCompass turns a technician's plain-language fault report into a cited, safety-checked
recommendation for an operations control room. Nemotron on Nebius Token Factory investigates
it with read-only tools; code checks every claim, and a person approves every dispatch.

## Project description (what, why, how)

**What.** An AI dispatch and troubleshooting assistant for industrial control rooms. A field
report arrives as free text. ResponseCompass:
- works out which station and symptom the report most likely describes;
- investigates past repairs;
- recommends the first safe corrective action from the plant's procedure catalog, with the
  past cases it relied on;
- ranks the responders who are available **and** certified for that action.

Central command approves, escalates or rejects. When the evidence is thin, or the report
describes a hazard, the system says so instead of guessing.

**Why.** In a control room, the nearest technician and the first fix tried are often guesses,
and a confident-sounding wrong answer is worse than "I don't know". Most AI assistants are
built to always produce an answer. We built one whose authority is limited by design:
- the application owns every fact, eligibility rule, safety rule and the dispatch itself;
- the model may only rank what it is given and explain, with citations that code verifies.

**How.**
- **Nemotron 3 Super** ranks interpretations of the report, and the operator confirms one.
  It also ranks responders, fixes and overtime options elsewhere in the app.
- **Nemotron 3 Ultra** runs a bounded tool loop:
  - at most six read-only tools, eight calls and 120 s;
  - the tools see only outcomes completed before the decision time;
  - it returns hypotheses, fixes and responders with structured evidence references.
- **Code validates the output:**
  - every cited case must have been returned by a tool in this run;
  - fixes must come from the catalog, with steps quoted verbatim, not generated;
  - responders must be eligible and certified;
  - evidence grades and outcomes are computed by code.
- **Hazards and garbled input** are decided by code before any model call.
- **Approval** confirms each safety prerequisite, and one dispatch gate covers every
  assignment path.
- **Nemotron 3.5 Lightning** plans simulated events.
- If a model is slow or invalid, a labelled deterministic path takes over, and the floor
  keeps running.

## How we used Nebius Token Factory and NVIDIA models

- Runtime inference goes through the Token Factory OpenAI-compatible API. Each role has its
  own model, thinking setting and timeout, chosen from live measurements on our own requests
  (`docs/nebius/05_TOKEN_FACTORY_FACTS.md`):
  - Super, thinking off: ranking, 5/5 valid at 3.2 s;
  - Ultra: investigator;
  - Lightning, thinking off: planner and narrator.
- Native tool calling for the investigator.
- `GET /v1/models?verbose=true` for pricing, limits and capabilities.
- Per-provider rate limiter, 429 retry and circuit breaker.
- What Token Factory changed for us: on our previous provider a ranking took 20–60 s; on
  Nemotron Super it takes about 3 s. That made a multi-step live investigation (about 15 s,
  ≈ USD 0.03) practical in an interactive control room.

## Significant update during the Submission Period (pre-existing project disclosure)

ResponseCompass existed before this entry: it was built for an earlier AMD hackathon. The
Nebius entry starts from baseline commit `1e1c69c` (2026-10-19). Everything after it is new;
`HACKATHON_CHANGES.md` lists each change with commits and tests:
- the Compass Investigator: field reports, the code-owned hazard and input policy,
  interpretation ranking with operator confirmation, the Ultra tool loop with validation, the
  dispatch gate and the approval workflow;
- the investigation data contracts: public certifications, procedure safety classes and
  prerequisites, case records, and the decision-time cutoff;
- the Nebius Token Factory provider with four model roles;
- an evaluation harness and live evaluation (run 2: 24/24 outcome classes, 64/64 valid citations, 0 safety violations, 6/6 hazard/input decisions without a model call, median 8.9 s);
- a new deployment.

## Links

- Working demo: ⟨URL — reuses compass.makodev58.com after the AMD event ends; until then
  Tailscale-only⟩
- Demo video (YouTube, < 3 min): ⟨URL⟩ — script in `docs/DEMO_SCRIPT.md`
- Public repository: ⟨https://github.com/e8aura-makodev58/…⟩ (Apache-2.0)

## Testing instructions for judges

⟨Open the demo URL → choose control room e8-aura-p1 → Live Floor. In the Field reports panel
press **Report incident** and describe a fault, e.g. "Station 12: the transfer keeps stopping
short of the end position every few cycles". Confirm the suggested interpretation, open the
investigation, tick the safety prerequisites and approve. Try a hazard report ("…light smoke
near the drive") to see it escalate without a model call. Rooms pause after 10 idle minutes;
press Resume to run the simulation live.⟩ No login is required. Live mode spends our Nebius
credit; Offline Demo makes no API calls.

## Feedback on Nebius Token Factory and NVIDIA models

What worked well:
- The `?verbose=true` model listing returns context length, pricing, per-model RPM/TPM
  limits, supported features and region. It let us choose models from data rather than
  guesswork.
- Native tool calling produced well-formed `tool_calls` with valid JSON arguments on every
  Nemotron model we tried (19 of 20 runs; the 20th timed out).
- Latency was low enough for interactive multi-step agents: Super ranks in about 3 s with
  thinking off, and Ultra completes a 5–7-call investigation in about 15 s.
- Reasoning comes back in a separate `reasoning_content` field, so JSON content stays clean.

What could be better:
- **Thinking control is inconsistent.** Only
  `chat_template_kwargs: {enable_thinking: false}` turned reasoning off on every Nemotron
  model. `reasoning_effort` changed behaviour only on Super, and a `/no_think` system prefix
  did nothing. One documented, model-independent switch would help.
- **Default thinking is easy to trip over.** With thinking on by default, Lightning spent
  its whole 1,024-token budget on reasoning and returned truncated output in 4 of 5 runs.
  Super with thinking on was slower and less consistent on our ranking task (4/5 valid,
  17.6 s, versus 5/5 at 3.2 s with thinking off). Recommended defaults per task type in the
  docs would save time.
- **Licences are missing from the listing.** We had to read Hugging Face model cards to find
  them (OpenMDW 1.1 for Ultra and Lightning, the NVIDIA Nemotron Open Model License for
  Super and Nano).
- **Agentic "escalate" semantics.** Ultra sometimes set a model-proposed `ESCALATE` next to
  a good recommendation; our validator now rejects that combination and asks for one repair. Guidance on structured
  "abstain/escalate" fields in agent prompts would help other builders.

## IRL city event

⟨Attended Builders & Brews city, or "none"⟩
