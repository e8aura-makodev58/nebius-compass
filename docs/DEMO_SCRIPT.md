# Demo video script — under 3 minutes (Nebius x NVIDIA)

**Status:** draft v1 (2026-10-19). Record on the live deployment with a real Nemotron run.
Never splice in fixture output as if it were live. If a backup take uses the Offline Demo,
caption it "Offline replay". Target length 2:45. English narration, no third-party music.

| Time | Screen | Narration (approx.) |
|---|---|---|
| 0:00–0:15 | Live Floor, plant-1, month of history, floor map and tiles | "When equipment fails on a factory floor, the closest technician isn't always the right one, and the first fix tried is often a guess. ResponseCompass is a control-room agent built on NVIDIA Nemotron, served by Nebius Token Factory." |
| 0:15–0:30 | Settings → API: Nebius selected, four roles (Super / Ultra / Lightning) | "Each job uses its own Nemotron model, measured on our own requests: Super ranks in about three seconds, Ultra investigates, Lightning plans the simulation." |
| 0:30–0:50 | Field reports → Report incident, type the Station 12 report, submit | "A technician reports a fault in plain language. Before any model sees it, code screens it for hazards and prompt injection." |
| 0:50–1:05 | Interpretation options; confirm B-STOP | "Code builds the possible readings: which station, which symptom. Nemotron Super ranks them. The operator confirms the facts; the model never creates them." |
| 1:05–1:40 | Investigation detail: source badge "Nebius · Nemotron-3-Ultra", calls/latency/tokens; open **Investigation steps**; click a case chip to show the cited past case | "Nemotron Ultra investigates with read-only tools: past cases, the procedure catalog, fix evidence and eligible responders. Every case it cites must have come back from a tool in this run, and code checks that. The procedure is quoted from the catalog, never generated." |
| 1:40–2:00 | Recommended first action: specialist-only safety class; responders, one marked "Not qualified"; tick prerequisites; Approve | "Code grades the evidence and checks certifications. Approve stays locked until the operator confirms each safety prerequisite. One dispatch gate covers every assignment path, so nothing reported here is dispatched without a person." |
| 2:00–2:15 | Feed and audit show approved → assigned | "Approval dispatches exactly that responder with that fix, and the decision goes into the audit trail." |
| 2:15–2:35 | Report "…light smoke near the drive" → Escalated — safety, 0 model calls; then a report with no evidence → Abstained | "Ask about a hazard and it escalates to a person without calling a model. Without evidence it abstains instead of inventing an answer." |
| 2:35–2:50 | `docs/evaluation.md` table or the eval output | "We measure this: 24 scenarios, citation validity, safety violations, abstention. Everything is open source under Apache-2.0." |

Recording checklist:
- Use the live deployment and pause other rooms.
- Run one rehearsal so the deterministic fallback is not what the video shows.
- Keep the source badge visible, so viewers can see the Nebius live run.
- Show no keys and no Settings credential fields.
- Use a browser zoom that keeps text legible at 1080p.
- After the final live evaluation, replace the numbers on the evaluation slide with the
  final run's numbers.
