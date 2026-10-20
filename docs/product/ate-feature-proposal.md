# ATE, final test and wafer sort: candidate Compass features

Proposal for discussion, 2026-10-20. These are candidate extensions, not implemented
capabilities or approved requirements. All identifiers, examples and policies below are
synthetic and domain-neutral; no customer, device, recipe or site data is used.

Start with traceable consumable care and equipment readiness, then add engineering review
workflows. These give the existing issue/responder/event model useful facility context
without requiring a model to diagnose equipment, set priorities or control test limits.

## Product fit and working assumptions

A test cell should be represented as linked assets: ATE tester plus handler for FT, or tester
plus prober for WS, with the currently installed interface assembly and its replaceable
parts. Keep the cell as the issue's operational location and link the affected component;
a moved loadboard or probe card must retain its own history. Track site/position membership
and installation intervals so an alarm can be traced to what was installed at event time.

The requested vocabulary includes sockets on WS probe cards. Confirm the facility's actual
assembly hierarchy before making that universal: wafer-contact probes/pins, card interfaces,
and package-test sockets need distinct asset types and cycle units. A contactor may contain
replaceable pins, but not every card or socket has the same serviceable parts. No proposed
feature depends on assuming they are interchangeable.

Current foundations are issues, responder availability/qualifications, observed history,
operational events, deterministic priority/staffing and investigation approval. See
[domain model](../../project-state/backend/domain-model.md),
[simulation](../../project-state/backend/simulation.md) and
[agent boundary](../../project-state/concepts/agent-boundary.md). The asset registry,
consumable counters, lots, measurement streams, inventory reservations and engineering
sign-offs proposed here are new scope; they do not already exist in those foundations.

For every candidate:

- Application code owns imported facts, units, thresholds, eligibility, priority, timing,
  derived metrics, deduplication and all mutations. Approved policies are versioned and
  operator/engineering decisions are recorded with actor, reason and expected revision.
- Models may rank only supplied eligible responder or catalog option IDs with qualitative
  tradeoffs. They cannot set thresholds, infer root causes, forecast hidden remaining life,
  invent procedures, grant release, change schedules or decide product disposition. A model
  is optional; a deterministic baseline and manual review remain usable during an outage.
- **Hidden `ResponderSkill` and private fault truth never enter model packets, public APIs,
  ordinary UI or analytics, including through proxies.** Public certifications determine
  qualification. Consumable limits come from approved asset policy and observed counters,
  never responder identity or inferred personnel ability.
- Live and Offline use the same rules and workflows. Offline replays synthetic, labelled
  readings/events without APIs. Real equipment integration would be a later, separately
  approved adapter; no direct machine control is assumed here.

Sizing is relative, not a delivery promise: **S** is a bounded workflow using existing
entities and manual entry; **M** adds a small persisted domain with audit/UI and migrations;
**L** adds time-series or lot lineage, multiple resource scheduling, or complex approval
and import semantics. The sizes below include a useful first slice with synthetic/manual
input, not an MES or equipment-vendor integration.

## Ranked top five

| Rank | Candidate | Size | Why first / dependency | First acceptance signal |
|---|---|---|---|---|
| 1 | F1 Socket/contactor life and cleaning | M | Clear operational trigger; creates reusable asset/counter policy foundation | A due counter creates one issue; recorded cleaning resets only the cleaning interval |
| 2 | F3 Loadboard inventory and checkout | M | Makes maintenance and changeover feasibility visible; reuses the asset foundation | Concurrent checkout attempts cannot allocate the same board twice |
| 3 | F4 Handler jam and throughput-loss triage | M | Extends today's incident response with observed impact and useful denominators | A jam burst creates one incident and measured loss excludes planned stops |
| 4 | F2 Probe-card/pin planarity and wear review | M | Reuses F1 counters and installation lineage for WS; requires agreed measurement policy | A qualified inspection is required to clear an out-of-policy card |
| 5 | F8 Calibration and tester-correlation readiness | M | Adds an explicit readiness gate before broader yield comparisons | Expired calibration blocks a proposed reservation; correlation evidence remains a separate record |

Then F5 changeover reservations, F6 yield/bin review, and F7 retest/guardband review.
This ordering is a product judgement based on auditability, dependencies and likely data
availability, not a measured ROI claim. If authoritative calibration records already exist,
F8 can move ahead of F4. Validate the ranking with operations and test engineering first.

## F1 — Socket and contactor life, cleaning cadence

**User problem and assets.** Operators need to see which installed FT socket/contactor is
due for cleaning, inspection or replacement before a repeat contact incident. Concerns the
tester/handler cell, loadboard, socket/contactor and replaceable contact pins; WS cleaning
uses the same counter framework but separate card/pin policies under F2.

**Data needed.** Serialized assembly/part IDs, site position, compatible configuration,
installation/removal times, cumulative actuations or insertions with explicit units,
last cleaning counter/time, approved service limits and procedure versions, service and
replacement events, observations and source quality. Keep lifetime and since-service
counters separate. Missing opening lifetime is unknown, not zero.

**Deterministic ownership.** Calculate elapsed time and counter differences from deduplicated
source events; classify due/overdue using approved policy per component family. Raise or
update one issue per asset and service obligation, compute its priority using configured
rules, and offer only qualified, available responders. Cleaning records reset only the
relevant since-clean counter; replacing a component starts a new serialized lifecycle and
preserves the old history. Lifetime exhaustion can require replacement even after cleaning.

**Bounded model role.** Optional ranking of eligible responders or already-approved service
catalog IDs with qualitative evidence. It cannot extend a life limit or prescribe a solvent,
force, temperature or cleaning technique.

**Synthetic slice.** `SOCKET-A` is due under `CARE-POLICY-A`; a service issue links the
installed board and cell. A cleaning acknowledgement leaves its lifetime total unchanged.
**Size:** M. **Main risk:** miscounted or reset controller counters make life appear longer
than observed. Counter discontinuities must create a reconciliation state, with no automatic
release based on uncertain usage. Remaining allowance is a policy balance, not a lifetime
prediction or a probability of failure.

## F2 — Probe-card and probe-pin planarity/wear alarms

**User problem and assets.** WS staff need a consistent path from a measured planarity,
contact or inspection concern to a qualified inspection. Concerns prober, tester, probe card,
probe pins/tips and any separately identified card interface/socket assembly.

**Data needed.** Card serial/revision, pin or replaceable-group identity where supported,
touchdowns, cleaning history, inspection time/method, measured tip-height/planarity and wear
fields with units, temperature/configuration, instrument calibration status, approved
limits, photos as attachments, and installation lineage. A visual note alone is not a
quantified wear measurement.

**Deterministic ownership.** Compare valid measurements against the matching approved
inspection policy, check source age/units/calibration, and open one card-linked issue.
Separate 'inspection due', 'measurement out of policy' and 'evidence unavailable'. If a
policy requires quarantine, code blocks new reservations pending an authorized inspection
and clearance. A repaired pin group changes that group's lifecycle, not every pin's age.

**Bounded model role.** Optional ranking of supplied inspection catalog options and eligible
specialists. It cannot infer planarity from an unvalidated photo or choose alignment,
overdrive or pin adjustment settings.

**Synthetic slice.** `CARD-A` has an out-of-policy signed inspection; its issue follows the
card when removed from `CELL-B`. **Size:** M with manual readings; automated image analysis
is excluded. **Main risk:** limits depend on card technology and measurement conditions;
a generic threshold can cause false clearance or unnecessary downtime.

## F3 — Loadboard inventory, compatibility and checkout

**User problem and assets.** A changeover or repair stalls because the recorded spare is
already installed, under repair, incompatible or missing. Concerns tester, loadboard,
installed FT sockets/contactor, and changeover kits; the inventory pattern can later cover
WS probe cards without conflating their compatibility rules.

**Data needed.** Serialized board/revision, location/custodian, approved compatibility matrix
for tester/interface/program revision, condition, inspection/calibration evidence where
applicable, component membership, installation interval, reservations and check-in/out
records. Compatibility must be explicitly approved, not inferred from similar names.

**Deterministic ownership.** Track AVAILABLE, RESERVED, CHECKED_OUT, INSTALLED, QUARANTINED
and IN_REPAIR transitions with revision checks. Atomically reserve an asset once, reject
overlaps and incompatible configurations, and record custody transfers and reservation
expiry. Physical return requires verified check-in; expiry never makes an installed board
available. Missing/spare-shortage conditions create an issue linked to the waiting cell.

**Bounded model role.** None required. An optional responder ranking can support retrieval
or inspection work; asset eligibility and selection policy remain code-owned.

**Synthetic slice.** Two proposed changeovers request `BOARD-A`; only one reservation can
commit, while the other receives an explicit conflict and lawful alternatives. **Size:** M.
**Main risk:** database availability diverges from physical custody. Reconciliation and a
quarantine state are essential; silent operator 'force available' overrides are excluded.

## F4 — Handler jam episodes and observed throughput loss

**User problem and assets.** Repeated short jams can disappear inside isolated tickets,
while a slow cell attracts attention without clear evidence of where time was lost.
Concerns FT handler, tester and installed loadboard/socket path; inspect the contactor only
when observations support that work, rather than treating every jam as a contact fault.

**Data needed.** Timestamped handler alarms, run/stop transitions and reason codes,
accepted-unit counts, active site count, test program/revision, operating configuration,
planned stops/changeovers, configured reference rate and observation window. Record
whether an alarm timestamp denotes occurrence or ingestion.

**Deterministic ownership.** Group jams into policy-defined episodes, deduplicate events,
calculate stopped duration and accepted units per running minute. Compare only compatible
windows; estimate a reference-rate deficit with the reference and denominator visible,
never label it measured recoverable production. Priority uses observed impact and approved
thresholds. Existing eligibility/approval gates govern responder dispatch and any restart
clearance; the model cannot command the handler.

**Bounded model role.** Optional eligible-responder/catalog-option ranking using the public
alarm timeline. No causal conclusion from a coincident socket change or a slow rate.

**Synthetic slice.** Several `HANDLER-A` jam alarms become one episode with a retained event
trail, while a planned changeover is excluded from unplanned stopped time. **Size:** M.
**Main risk:** product mix, test duration and disabled sites confound rate comparisons;
unknown context should suppress the deficit comparison while preserving raw counts.

## F5 — Device changeover readiness and bounded scheduling

**User problem and assets.** A booked changeover reaches its start time without a compatible
loadboard/card, handler kit, socket, qualified crew or current tester readiness. Concerns
tester, handler/prober, loadboard, socket/contactor, probe card/pins and changeover kits.

**Data needed.** Synthetic product-family/configuration IDs, approved sequence checklist and
durations, lot-ready windows, due windows and deterministic priority, current assignments,
qualified crew duty/rest, kit compatibility, F3 reservations, and F8 readiness status.

**Deterministic ownership.** Enumerate feasible slots under fixed windows, compatibility,
resource exclusivity and duty/rest constraints. Use an explicit deterministic ordering
(e.g. approved priority, due window, stable ID) to propose a schedule. An operator accepts
reservations after atomic conflict/revision revalidation. Execution remains checklist work
with recorded completion and engineering first-article acceptance where policy requires it.
No qualified slot means an explicit unscheduled state. Replanning records what moved and
why; a priority change must not silently evict accepted work.

**Bounded model role.** Optional ranking of eligible responders for one changeover task.
The model cannot select the facility schedule, invent durations or change due priorities.

**Synthetic slice.** `FAMILY-A` requires `BOARD-A` and `KIT-A`; a conflicting reservation
removes that slot before the operator sees a proposal. **Size:** L; a manual readiness
checklist alone is an M precursor. **Main risk:** multi-resource planning expands scope;
start with one room and bounded windows, not an unbounded optimizer or throughput promise.

## F6 — Yield and bin excursions as engineering review issues

**User problem and assets.** Engineers need a traceable alert when an observed bin
population shifts, without a maintenance tool declaring the product bad or inventing a
root cause. Concerns tester and FT handler/loadboard/socket or WS prober/card/pins, linked
to the actual installed configuration and program revision at the observation time.

**Data needed.** Lot/wafer or synthetic batch IDs, unique tested unit identities, initial
versus retest attempts, site/bin counts and bin definitions, test program and limit-set
versions, temperature/configuration, approved baseline windows, minimum samples and
engineering-approved excursion rules. Preserve event-time lineage and late corrections.

**Deterministic ownership.** Calculate initial-pass yield and bin rates with explicit
numerators/denominators; show retest recovery separately without counting attempts as unique
units. Compare compatible cohorts only and apply versioned statistical/control rules,
minimum samples, hysteresis and episode deduplication. Create an engineering review issue;
a hold is proposed for authorized action, or applied only by an explicitly enabled audited
policy. Alerts alone cannot scrap, release or rebin units. Correction of a source count
revises evidence without deleting the original decision trail.

**Bounded model role.** Optional ranking of approved investigation options from returned
public evidence. It cannot identify hidden causes or compute yield, confidence or priority.

**Synthetic slice.** `BATCH-A` shows a configured bin excursion on one site; the issue
contains counts and installed assets but claims no cause. **Size:** L. **Main risk:** mixed
cohorts and repeated testing manufacture apparent yield shifts. Preserve data quality,
insufficient-sample states and rule provenance before adding alert volume.

## F7 — Retest requests and guardband change review

**User problem and assets.** A retest or proposed limit change needs clear ownership,
traceability and scope; a maintenance recommendation must not become permission to pass
marginal units. Concerns tester/program/limit set, affected lot or wafer, and its handler/
loadboard/socket or prober/card/pin configuration.

**Data needed.** Unique unit and attempt lineage, original results, approved retest rules
and caps, reason codes, configuration changes, proposed versioned limit-set change,
engineering evidence, authorized approver roles, affected scope and expiration. Actual
limits would remain in the authoritative engineering system; the initial Compass slice
stores synthetic references and decision records, not production programs.

**Deterministic ownership.** Determine whether a request fits an existing approved retest
policy, detect duplicate/exhausted requests, calculate observed retest recovery with counts,
and present a bounded review package. Code enforces approval roles and exact scope/revision.
Guardband modification always requires the configured qualified engineering authority and
validation evidence. A missing approval means pending/blocked; a timeout does not approve.
No automatic widening of limits, repeated 'test until pass', bin remap or device release.

**Bounded model role.** None for retest eligibility or guardband decisions. Optional ranking
of eligible review responders from public qualifications is sufficient; qualitative model
text is never an approval or test-limit proposal.

**Synthetic slice.** `BATCH-A` has an authorized scoped retest request; an accompanying
`LIMIT-REV-B` proposal remains pending until engineering signs that exact revision.
**Size:** L; a read-only request/sign-off register is an M precursor. **Main risk:** escape
or overtest caused by ambiguous unit lineage, stale scope or authority. Keep execution in
the approved external test workflow until integration ownership is explicitly defined.

## F8 — Calibration expiry and tester correlation readiness

**User problem and assets.** A cell appears available while a required calibration is
expired, or a moved interface assembly lacks the engineering correlation evidence required
for its intended use. Concerns tester/instruments plus FT loadboard/socket or WS probe card/
prober path; relevant handler/prober temperature capability is configuration context.

**Data needed.** Calibration certificate/scope, instrument identity, due dates, measurement
units, maintenance events, configuration revisions, authorized reference artifacts,
correlation measurement sets, acceptance criteria and sign-off. Track reference artifacts'
validity and handling history as well. Calibration and correlation are separate obligations.

**Deterministic ownership.** Evaluate scope and expiry against the intended configuration;
create due/expired issues and readiness exclusions. Compute correlation deltas from
supplied matched measurements under an approved engineering method; a matching yield rate
alone is not correlation evidence. Qualification, sign-off and configuration revisions
govern return to service. A relevant configuration change invalidates affected evidence
according to policy, not every certificate indiscriminately.

**Bounded model role.** Optional ranking of qualified responders for the due task and
approved catalog checks. It cannot issue a certificate, invent a tolerance, correct tester
measurements or waive an acceptance criterion.

**Synthetic slice.** `TESTER-A` has a current instrument certificate but a new board
revision awaiting correlation; the readiness view shows the two independent states.
**Size:** M for certificates/manual signed results; automatic metrology ingestion is later
scope. **Main risk:** a coarse 'calibrated' flag hides configuration and measurement scope.
Keep a clear distinction between evidence missing, overdue and measured out of policy.

## Shared first delivery and production acceptance

Build the serialized asset/installation registry and an auditable manual event path before
drawing synthetic wear curves or adding integrations. One issue may link several affected
assets, and concurrent obligations need separate reason codes; do not force socket care and
a yield excursion into an indistinguishable generic alarm. A proposed component task must
reuse the existing assignment/investigation gate rather than bypassing it through a new
inventory or maintenance endpoint.

An initial F1/F3 slice should prove duplicate-event idempotency, late/out-of-order imports,
counter rollover/reset reconciliation, two-client reservation conflicts, install/remove
lineage, stale approval rejection, restart recovery and bounded event/history retention.
Archive completed detail while retaining policy/decision/asset references needed to explain
old counts and approvals. Display source age and a missing-data state; loss of telemetry
must not silently restore readiness. A newly discovered restriction on running equipment
creates an escalation for an authorized operator; it does not imply a remote emergency-stop
capability. Offline fixtures must exercise the same transitions and failure states, and
model-outage behavior must preserve policy enforcement and operator controls.

Engineering owns procedure content, thresholds and disposition authority; operations owns
custody and task completion. Any future machine/MES adapter needs explicit source ownership,
authentication, idempotency keys, timestamp rules and reconciliation. Success is observable
workflow correctness first: fewer unresolved due obligations, traceable asset custody and
clearer incident evidence. Claims about yield gains, longer hardware life or saved units
need a separately designed evaluation with a valid baseline and denominators.

## Assumptions to confirm with the user

1. What is the actual FT/WS assembly hierarchy, especially 'socket' on WS, and which pins or
   groups are individually serialized or replaceable? What unit does each cycle counter use?
2. Which authoritative systems own inventory, service counters, calibration, lots/test
   results and approved limits? Should Compass begin with manual records, file imports or
   a read-only adapter, and what timestamps/identity quality can those sources provide?
3. Who owns approved cleaning/replacement/inspection policies and tolerances? What evidence
   permits clearance, and which missing-data conditions block a new start versus escalate
   an already-running job?
4. Who may hold/release lots, authorize retest, approve a guardband revision or sign
   correlation? Are independent reviewers or separate engineering sign-offs required?
5. Which operational pain is largest: lost asset custody, consumable care, repeated jams,
   changeover readiness or engineering excursion review? What measured baseline should the
   first slice improve, and at what event volume/retention window?
6. Are cross-room reservations and scheduling needed initially? Which due dates, duty/rest
   rules and accepted reservations are hard constraints, and what replanning needs approval?

## Public terminology references

These manufacturer references validate terminology only; they do not establish this
facility's policies or support any proposed ROI. Recommendations above are product/design
judgements derived from the assignment and Compass's boundaries.

- [Advantest ATE overview](https://www.advantest.com/en/semiconductor-basics/automated-test-equipment/)
  distinguishes wafer probing from handler-based package/final test.
- [Cohu interface solutions](https://www.cohu.com/interface-solutions) describes the
  tester/device contactor interface and consumable probe pins, including cleaning/life concerns.
- [FormFactor Kepler probe card](https://www.formfactor.com/product/probe-cards/foundry-logic/kepler/)
  provides an example of card-specific planarity adjustment; it is not a generic acceptance
  limit or an instruction to adjust a particular card.
- [Invantest Retest Analyzer](https://www.invantest.com/products/standalone-client-applications/retest-analyzer)
  discusses retest analysis at WS/FT, supporting the distinction between analyzing observed
  recovery and authorizing a retest policy.
