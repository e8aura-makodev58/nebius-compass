# Nebius Token Factory — verified facts (N0)

Measured by the main agent on **2026-10-19** with the team key. Sources:
- `GET /v1/models?verbose=true` (catalog, pricing, limits, features);
- live calls through `scripts/probe-nebius.mjs`.

Small samples (1 + 5 per setting). Re-measure on the real Compass packets after N1 merges.

## Endpoint and authentication

- Base URL: `https://api.tokenfactory.nebius.com/v1`. The API is OpenAI-compatible
  (`/models`, `/chat/completions`).
- Auth header: `Authorization: Bearer <key>`. The key is a single line starting with `v1.`.
  It lives in `~/nebius.token` (mode 600, outside git); the main agent only.
- `GET /v1/models` lists 28 models. `?verbose=true` adds context length, pricing, per-model
  limits, `supported_features` and region.

## NVIDIA models available (catalog, 2026-10-19)

| Model id | Context | Price in / out (USD per 1M tokens) | Limits (RPM / TPM) | Features | Region |
|---|---|---|---|---|---|
| `nvidia/Nemotron-3-Ultra-550b-a55b` | 1,048,576 | 1.00 / 3.00 | 300 / 200k | tools, reasoning | us-central1 |
| `nvidia/nemotron-3-super-120b-a12b` | 262,144 | 0.30 / 0.90 | 300 / 200k | tools, reasoning | us-central1 |
| `nvidia/Nemotron-3.5-Super-VL` | 1,048,576 | 0.30 / 0.90 | 300 / 2M | tools, reasoning; text+image | us-north1 |
| `nvidia/Nemotron-3_5-Lightning` | 1,048,576 | 0.06 / 0.24 | 600 / 400k | tools, reasoning | eu-north1 |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | 262,144 | 0.06 / 0.24 | 100 / 800k | tools, reasoning | eu-north1 |

Model licences are not in the API. Check NVIDIA's model cards before N7 and link them here.

## Request behaviour (live probe)

- **JSON mode.** `response_format: {type: "json_object"}` works on every Nemotron model.
  Reasoning comes back in a separate `message.reasoning_content` field, so `content` stays
  clean JSON. As before, reasoning text is never parsed, stored or shown.
- **Thinking control.**
  - `chat_template_kwargs: {enable_thinking: false}` turns reasoning off on every model
    tested.
  - `reasoning_effort: "low"` only shortened reasoning on Super, and was ignored elsewhere.
  - A `/no_think` system prefix had no effect.
  - **Use `chat_template_kwargs.enable_thinking`** as the per-model mapping.
- **Truncation.** Lightning with thinking on used up `max_tokens: 1024` on reasoning
  (`finish_reason: "length"`) in 4 of 5 runs. Keep `max_tokens` ≥ 4096 when thinking is on.
  The existing truncation guard treats `length` as a failure.
- **Tool calling (native).** OpenAI-style `tools` + `tool_choice: "auto"` returned a
  well-formed `tool_calls` entry with valid JSON arguments on **every** model (19 of 20
  runs; the one failure was a timeout). The second turn, with the `role: "tool"` result,
  worked on all models. Whether the final answer quoted the returned case id was not
  required by the probe prompt, so citation rates here say nothing about validity. The
  investigator's validators and prompt will require structured evidence refs.

### Ranking JSON validity (both supplied ids, qualitative prose without digits), 5 runs each

| Model | Thinking on (default) | Thinking off |
|---|---|---|
| Ultra | 5/5, median 1.8 s | 5/5, 0.8 s |
| Super | 5/5, 3.1 s | 5/5, 0.9 s |
| Lightning | 1/5 (truncation at 1024 tokens) | 5/5, 0.7 s |
| Nano | 5/5, 3.9 s | 2/5 (omitted a candidate) |

### Tool loop (call + answer from tool result), 5 runs each

| Model | Thinking on | Thinking off |
|---|---|---|
| Ultra | 5/5 tool calls, median 3.0 s; final cited the case 5/5 | 5/5, 1.5 s; cited 5/5 |
| Super | 5/5 tool calls, 2.1 s | 5/5, 2.2 s |
| Lightning | 5/5 tool calls, 1.2 s | 5/5, 1.1 s |
| Nano | 5/5 tool calls, 4.3 s | 4/5 (one 120 s timeout), 1.2 s |

## Real Compass packets (2026-10-19, `npm run measure:amd -- --provider nebius`, 5 samples)

These are the app's own Scenario A ranking packet and event-planner packet, sent through the
app's validators, provider controls and the 90 s / 30 s timeouts. The "expected top" column
counts how often the model's top pick was `R-ENGR028`, the expected pick for this one scenario;
it is not a general accuracy measure. Thinking-off rows ran against the N1b capability table
on the codex branch, because master did not have it yet.

| Model (thinking) | Ranking valid | Expected top | Ranking median | Planner valid | Planner median | Failures |
|---|---|---|---|---|---|---|
| **Super (off)** | **5/5** | **5/5** | **3.2 s** | 5/5 | 1.7 s | — |
| Super (default = on) | 4/5 | 2/5 | 17.6 s | 5/5 | 2.9 s | one truncated at 4096 tokens |
| Ultra (default = on) | 5/5 | 5/5 | 8.2 s | 5/5 | 2.0 s | — |
| Ultra (off) | 5/5 | 3/5 | 3.5 s | 5/5 | 2.2 s | — |
| **Lightning (off)** | 5/5 | 2/5 | 3.6 s | **5/5** | **1.3 s** | — |
| Lightning (on) | 0/5 | — | — | 4/5 | 8.7 s | ranking truncated ×5; one planner schema error |

On the real packet, Super with thinking on is slower and less consistent than with thinking
off: its reasoning runs long and once hit the output cap. **The ranking default changes to
Super / off.** The planner default stays Lightning / off.

## Defaults for N1 (role → model, thinking)

| Role | Model | Thinking | Why |
|---|---|---|---|
| `investigator` | `nvidia/Nemotron-3-Ultra-550b-a55b` | on | Best tool-loop behaviour; ~3 s per step. Fallback tier: Super. |
| `compass` (responder, fix, staffing ranking) | `nvidia/nemotron-3-super-120b-a12b` | **off** | Real packet: 5/5 valid, 5/5 expected top, 3.2 s (thinking on: 4/5, 2/5, 17.6 s). |
| `event-planner` | `nvidia/Nemotron-3_5-Lightning` | off | Real packet: 5/5 valid, 1.3 s; cheapest; 600 RPM. |
| `narrator` | `nvidia/Nemotron-3_5-Lightning` | off | Same. |

All four use `toolCalling: native`. The JSON next-action protocol stays as a fallback, but
no tested model needs it.

## Cost and limits

- An investigation with ≤ 8 Ultra calls at ~1–2k tokens each costs ≈ USD 0.01–0.03.
- A ranking call on Super costs ≈ USD 0.001.
- Provider limits are far above the app's own (RPM 20, concurrency 2 per plan N1). The app
  limiter stays the binding budget for the judge period.

## Plan updates this causes

- Latency is about 10× lower than AMD Token Factory (20–60 s). The 120 s investigation
  deadline is generous, so the ranking timeout can drop after measurement.
- Plan §2 tiering confirmed with one change: Lightning (not Nano) for the fast roles.
