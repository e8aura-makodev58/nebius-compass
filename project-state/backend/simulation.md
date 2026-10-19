# Simulation mechanics

The simulation is fully deterministic given its persisted RNG streams. Models influence
only *which* eligible responder is chosen and *what* plausible next issue appears; they
never touch the mechanics or outcomes below. All randomness is a 32-bit LCG
(`rngVersion: "lcg32-v1"`) with per-concern seeds in `simulationState.rngStreams`.

## Clock (`simulation-clock.mjs`)

Converts elapsed real time into simulated time while `RUNNING`, at 1× / 5× / 10× / 60×.
Pausing freezes simulated time; because time is derived from wall-clock deltas, a stopped
process does not advance and does not replay a catch-up burst on restart.

## Scheduler (`scheduler.mjs`)

Decides *when* the next issue is raised, on a bounded cadence, and rotates the scheduler
RNG stream. It is **process-level**: one interval for the whole deployment, dispatching
every `READY` room's tick concurrently (see [control-rooms.md](control-rooms.md)). Each
due event advances `dueEventToken` (`due-1` → `due-2` …) and reschedules the next.

## Context engine (`context-engine.mjs`)

The deterministic fact layer that feeds Compass. It computes eligibility and the evidence
for each candidate: floor-aware distance and travel time (`WALKING_SPEED_METRES_PER_SECOND`,
`FLOOR_TRANSIT_MINUTES`), same-issue-class success/median history, evidence strength, and
sample size — then assembles the bounded candidate packet. It contains **no model calls**,
and it never includes `ResponderSkill`.

## Attempt & resolution engines

- `attempt-engine.mjs` simulates the work: segments, a success draw, a duration factor,
  and multi-responder team effects. Key constants: `TEAM_SYNERGY = 0.60`,
  `TEAM_SUCCESS_CAP = 0.98`, and history weighting (`MAX_HISTORY_WEIGHT`,
  `FULL_HISTORY_COUNT`). A roster change **re-plans** remaining work; it never re-rolls the
  already-drawn outcome.
- `resolution-engine.mjs` finalizes a due attempt: writes `ResolutionHistory` (with
  per-participant `contributionShare` and a `TEMPORARY`/`DURABLE` durability class),
  returns responders to duty, and reopens the issue on failure. A temporary repair can
  recur later.

The hidden `ResponderSkill` (`trueMedianMinutes`, `trueSuccessProbability`) is one input to
the outcome draw, blended with confidence-weighted same-class observed history. It is
simulation truth and never leaves the engine. See
[domain-model.md](domain-model.md#invariant-responderskill-is-hidden-truth).

## Workforce continuity (`workforce-continuity.mjs`)

Policy version `wc-2`. Provisions 24 synthetic responders across four crews
(`CREW_IDS = ["A","B","C","D"]`) on a 14-day 2-2-3 rotation (A/C days, B/D nights) anchored
at `ROTATION_ANCHOR`. Enforces `MIN_REST_HOURS = 12`, `NORMAL_SHIFT_HOURS = 12`,
`MAX_DUTY_HOURS = 16`, and a `MAX_ACTIVE_STAFF = 8` on-shift cap. Drives shift handovers,
legal surge staffing, queue-first priority dispatch, and a `MAX_ACTIONABLE_ISSUES = 10`
cap. The provisioning seed never advances the simulation RNG streams. Eligibility, caps and staffing mutations remain application-owned and deterministic.
`staffing-service.mjs` separately builds observed responder history for a bounded Compass
ranking; it never affects lawful eligibility or resolution outcomes. Hidden skill is excluded.

Reviews create pending recommendations rather than applying surge. Ordinary issue arrivals,
resolutions and explicit releases request coalesced rechecks. Every lawful available
on-shift extension and rested off-shift call-in is supplied, with its legal duty endpoint.
Default policy is `OPERATOR`; central command approves a listed option or rejects it.
Approval rechecks shortfall, duty/rest, active cap and surge limit at the current time.
Stale choices change no staffing. A newer recommendation supersedes open work while retaining the earlier deadline, so
rechecks cannot defer the answer indefinitely. A no-action recheck leaves pending work
open; approval still revalidates its current need and legality. Deadlines default
to thirty simulated minutes and never cross the next handover; unanswered work expires,
recording unmet risk when demand still exceeds active staff. Explicit `AUTO_APPROVE_TOP`
policy attempts the top option at deadline, with the same legality guard and a policy audit.
Extensions remain lawful across handover until their recorded endpoint; new call-ins have
an explicit twelve-hour endpoint. Legacy call-ins retain their existing rest/duty behavior.
Claimed deadline tokens are durable, redispatched on restart and consumed only once.

## Responder location (`responder-location.mjs`)

Deterministic positioning: on assignment a responder moves beside the issue's equipment
with a small role-seeded offset (Primary vs. Support), and on release returns to a
persisted duty station. Movement is recorded as `RESPONDER_MOVED` operational-event
snapshots rather than continuous coordinates. No hidden skill or RNG is consulted.

## Faults and applied fixes

`fault-truth.mjs` assigns each new issue one of four latent causes in its class with a
separate persisted fault RNG stream and equipment-dependent priors. Overlapping public
symptoms carry signal without disclosing a cause. `fix-catalog.mjs` supplies six synthetic
procedures per class. New attempts freeze an applied fix and troubleshooting order;
its private effectiveness multiplies team success (clamped at the existing cap) and
scales duration through segment rates. Roster changes preserve the same fix and draw.
Failure reopens the issue and selects the next untried fix; after exhausting the catalog,
the sequence restarts. Legacy running attempts keep their pre-upgrade mechanics.

## Investigation procedure metadata and synthetic reports

The v2 public fix catalog adds validated safety classes, prerequisite enums and required
certifications, with routine, isolation-required and specialist-only procedures in each
class. Investigation eligibility requires availability and all procedure certifications;
operator prerequisite confirmation belongs to the later approval implementation.
Certifications use an independent responder-id-seeded RNG namespace and never read skill.
New issues get public-symptom template reports; the offline history generator writes
id-seeded noisy synthetic reports before compaction through both store adapters. This
consumes no engine RNG and calls no narrator. See [investigation.md](investigation.md).

Field-report issues are gated: `selectAttemptFix` freezes exactly the operator-authorized
procedure from the approved investigation, rather than the ordinary fix recommendation.
Authorization is consumed by the initial attempt ID; a failed attempt cannot automatically
retry with another fix/responder. Public snapshots do not synthesize a conflicting ordinary
fix ranking for these issues. Qualification and prerequisite checks precede assignment;
expiry, re-investigation and policy continuation follow in N3b. See [investigation.md](investigation.md).
