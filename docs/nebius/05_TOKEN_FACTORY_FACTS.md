# Nebius Token Factory — verified facts (N0)

Measured by the main agent on **2026-10-19** with the team key. Sources:
- `GET /v1/models?verbose=true` (catalog, pricing, limits, features);
- live calls through `scripts/probe-nebius.mjs`.

Small samples (1 + 5 per setting). Re-measure on the real Compass packets after N1 merges.

## Endpoint and authentication

- Base URL: `https://api.tokenfactory.nebius.com/v1`. The API is OpenAI-compatible
  (`/models`, `/chat/completions`).
- Auth header: `Authorization: Bearer <key>`. Credentials remain server-side and outside
  git; configure `NEBIUS_TOKEN_FACTORY_API_KEY` or `NEBIUS_TOKEN_FACTORY_API_KEY_FILE` without
  publishing the key or its private location.
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

**Licences** (from the Hugging Face model-card front matter, read 2026-10-19). We call the
models through Token Factory's API and do not redistribute weights. Licences are listed
here so the README states them accurately.

| Model family (card checked) | Licence |
|---|---|
| Nemotron 3 Ultra (`nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-NVFP4`) | [OpenMDW 1.1](https://openmdw.ai/license/1-1/) |
| Nemotron 3.5 Lightning (`nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16`) | [OpenMDW 1.1](https://openmdw.ai/license/1-1/) |
| Nemotron 3 Super (`nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-Base-BF16`; the instruct card was not in the search results) | [NVIDIA Nemotron Open Model License](https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-nemotron-open-model-license/) |
| Nemotron 3 Nano (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8`) | NVIDIA Nemotron Open Model License |

## Request behaviour (live probe)

These are historical measurements reported by the main agent. The repository contains their
summaries and the probe script, not complete per-run output artifacts; a new live run may
differ and spends provider credit.


- **JSON mode.** The four tabulated models returned JSON-mode responses in the probe;
  truncation and task-invalid output remain failures, so JSON mode alone is not validation.
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
- **Tool calling (native).** The published four-model native-tool table reports 20/20
  thinking-on and 19/20 thinking-off runs returning tool calls, with one thinking-off
  timeout. These small historical samples do not establish reliability for all Nemotron
  models or Super-VL. The application separately validates tool names, arguments and final
  citations. Whether the final answer quoted the returned case id was not
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
| `investigator` | `nvidia/Nemotron-3-Ultra-550b-a55b` | provider default (observed on) | Chosen from the recorded tool probes; failures use deterministic investigation, with no automatic Super tier. |
| `compass` (responder, fix, staffing ranking) | `nvidia/nemotron-3-super-120b-a12b` | **off** | Real packet: 5/5 valid, 5/5 expected top, 3.2 s (thinking on: 4/5, 2/5, 17.6 s). |
| `event-planner` | `nvidia/Nemotron-3_5-Lightning` | off | Real packet: 5/5 valid, 1.3 s; cheapest; 600 RPM. |
| `narrator` | `nvidia/Nemotron-3_5-Lightning` | off | Same. |

All four use `toolCalling: native`. The JSON next-action protocol stays as a fallback, but
no tested model needs it.

## Cost and limits

- Estimate Ultra cost as `(inputTokens + 3 * outputTokens) / 1_000_000` USD, and Super
  cost as `(0.30 * inputTokens + 0.90 * outputTokens) / 1_000_000`, using the dated N0
  prices. Tool-history size and output length vary; the call cap is not a cost cap.
- Local provider controls default to 20 starts/minute and concurrency 2 for Nebius.
  `COMPASS_DAILY_BUDGET_USD` optionally blocks new live calls after known estimated
  UTC-day spend reaches a positive limit; unset/0 is unlimited. Unpriced usage and
  in-flight calls mean this is not a hard provider-billing cap.

## Plan updates this causes

- Latency is about 10× lower than AMD Token Factory (20–60 s). The 120 s investigation
  deadline is generous, so the ranking timeout can drop after measurement.
- Plan §2 tiering confirmed with one change: Lightning (not Nano) for the fast roles.
