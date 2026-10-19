# Ask Compass — public room Q&A

## Role and tool boundary

`assistant-tools.mjs` constructs seven bounded read-only tools from one room snapshot:
`get_issue`, `get_investigation`, `issue_events`, `responder_public`, `search_cases`,
`recent_events`, and `analytics_summary`. Results are explicit public projections with
`kind`/`id` citation identities, never raw state or spreads of simulation truth. The
host fixes `asOf` to the room's current simulated time; tools cannot override it.
Each result has at most ten complete rows and 8,192 bytes. Unknown arguments fail closed.

Issue/investigation/event tools read retained detail; issue and analytics projections also
use retained public issue facts. Events expose selected public fields and decision/reason
metadata, not arbitrary event payloads. Cases reuse the investigator's completed-case
projection and cutoff. Responder counts require an explicit public issue class; general
roster questions do not silently assume a class. Summary numbers are application-derived
public counts matching the public analytics definitions (never probabilities or latent skill).

**Hidden skills, fault causes, attempt draws/effectiveness and unknown canary fields never
enter tool results.** `assistant-tools.test.mjs` checks every tool for noninterference,
canaries, schema/cutoff enforcement, byte/row limits and unchanged source state.

The `assistant` provider role defaults to Nebius
`nvidia/nemotron-3-super-120b-a12b`, thinking `off`, timeout 45,000 ms. It has separate saved
settings and role-specific provider env overrides, uses shared provider controls and the
usage/budget ledger, and appears as “Assistant (Ask Compass)” in the existing Settings
role fieldset pattern. Numeric prose uses the shared investigator validator and explicit
per-tool count/minute allowlists; narrative, ID and timestamp digits never ground numbers.
