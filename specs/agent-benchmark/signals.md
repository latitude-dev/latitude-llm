# Signals

> Read [`session-assessment.md`](session-assessment.md) for shared evidence vocabulary,
> [`score.md`](score.md) for the dimension estimands, and [`metrics.md`](metrics.md) for the
> deterministic observations used alongside signals.

A signal is Latitude's unit for a recurring defect. It has a name, description, example sessions,
cost impact, trend, and lifecycle. The Agent Score uses signals as evidence about outcomes, terminal
failure, resource waste, or confirmed harm.

A signal has no point budget and its existence does not lower a score. The effect comes from the
sessions it touches and the consequence measured on those sessions.

## Scoring metadata

Every canonical signal carries a non-null `scoreEvidence` list. It starts empty and is exposed as a
required list in domain and public contracts. Each entry contains:

```ts
type SignalScoreEvidence =
  | { scoreDimension: "outcome"; role: "taskOutcome" }
  | {
      scoreDimension: "reliability"
      role: "completionOutcome" | "operationalIncident"
    }
  | { scoreDimension: "cost"; role: "spendEfficiency" }
  | { scoreDimension: "speed"; role: "criticalPathEfficiency" }
  | { scoreDimension: "safety"; role: "confirmedHarm" | "exposure" }
```

[`session-assessment.md`](session-assessment.md#shared-vocabulary) defines the shared discriminated
contract. Signals use its defect-compatible subset. A recurring defect cannot declare
`successfulDefense`.

The dimension chips shown on a signal are the unique dimensions in this list. The list can contain
several dimensions. List length is not a multiplier because the dimensions use different estimands
and no role owns points.

An empty list means the signal is diagnostic only. It still appears on Signals and can be promoted,
assigned, resolved, and monitored. It does not silently route to Outcome. Unpromoted candidates,
user-created signals, historical signals backfilled during this rollout, and promoted signals whose
model classification and static fallback are unavailable or empty all use an empty list.

### Role semantics

| Role | How occurrences are used |
| --- | --- |
| `taskOutcome` | a feature in the calibrated per-session Task Success model |
| `completionOutcome` | informs the usable or terminal completion result established per occurrence |
| `operationalIncident` | records an incident whose terminal or recovered result is decided per occurrence |
| `spendEfficiency` | candidate explanation for incremental spend after deterministic waste is accounted for |
| `criticalPathEfficiency` | candidate explanation for incremental critical-path time after deterministic waste is accounted for |
| `confirmedHarm` | enters Safety only when the finding confirms agent-produced harm |
| `exposure` | context on Safety; never enters the failure numerator |

Dimension membership without a role is invalid. "This signal concerns Reliability" does not say
whether it proves terminal failure or merely describes a recovered incident.

## Product surfaces

Signal detail shows dimension chips derived from `scoreEvidence`. The evidence role and measured
effect appear in the impact section, with "effect not yet measured" when the role is known but the
consequence is not.

The Signals list can filter by score dimension but does not group by it. Selecting several
dimensions matches signals that inform any selected dimension. A signal that informs several
dimensions appears once with several chips. The session Signals tab shows the same chips. Dimension
areas remain empty when `scoreEvidence` is empty or the signal is ignored. Ignored signals keep any
stored classification in the API, but list, detail, and session surfaces do not treat those roles as
live scoring evidence.
Session assessment attaches the signal to one chronological evidence item and applies its roles per
dimension as defined in [`session-assessment.md`](session-assessment.md#signals). Surfaces organized
into separate dimension sections may show the same signal in each applicable section.

Benchmark evidence lists include only signals with at least one eligible occurrence in the selected
window. Promotion, lifecycle state, or a historical occurrence does not create a current item.

## Assignment at promotion

`scoreEvidence` is assigned when a signal is promoted and then latched. Signal details can be
regenerated every eight hours, but scoring roles cannot move between dimensions without a deliberate
reclassification.

When model generation fails, flagger-derived signals can use this static fallback mapping:

| Flagger | Evidence roles |
| --- | --- |
| `task-success` | Outcome `taskOutcome` for failed scores only |
| `tool-call-errors` | Reliability `operationalIncident`; Cost `spendEfficiency`; Speed `criticalPathEfficiency` |
| `output-schema-validation` | Outcome `taskOutcome`; Reliability `completionOutcome` |
| `empty-response` | Outcome `taskOutcome`; Reliability `completionOutcome` |
| `trashing` | Cost `spendEfficiency`; Speed `criticalPathEfficiency` |
| `low-cache-hit-rate` | Cost `spendEfficiency` |
| `forgetting` | Outcome `taskOutcome`; Cost `spendEfficiency` |
| `bluffing` | Outcome `taskOutcome` |
| `incompletion` | Outcome `taskOutcome` |
| `laziness` | Outcome `taskOutcome`; Speed `criticalPathEfficiency` when excess time is observed |
| `refusal` | Outcome `taskOutcome` |
| `frustration` | Outcome `taskOutcome` |
| `pii-leakage` | Safety `confirmedHarm` only for assistant disclosure; Safety `exposure` for user-authored PII |
| `jailbreaking` | Safety `confirmedHarm` for compliance; Safety `exposure` for attempts |
| `nsfw` | Safety `exposure` unless an assistant-side policy explicitly classifies the output as harm |

The condition on tool, finish, and safety findings is stored on the occurrence. A static signal role
does not turn every occurrence into a terminal failure or confirmed harm.

A mapped flagger slug is dominant when it occurs on more than half of the sample of up to 200 most
recent assigned scores that are published, failed, and non-errored. The denominator includes every
qualifying score, including scores with a missing, unknown, or unmapped slug. A tie, a mixed sample
without a strict majority, or a strict majority for an unmapped slug has no dominant mapped flagger.
Static fallback classification depends only on this sample. Promotion reads it when detail generation
is skipped or fails; the historical backfill reads it before deciding whether model classification is
necessary.

Every normal promotion uses one model call to generate the signal's name, description, and evidence
roles together, regardless of whether its scores have a dominant mapped flagger. The prompt defines
the estimands and requires evidence for every supported role. The model may return an empty list,
and a successful model classification takes precedence over the static mapping.

Promotion still succeeds when detail generation is skipped or fails. The failure path samples the
signal's flagger slugs and uses the static roles for a dominant mapped flagger. Otherwise the signal
is promoted with an empty list and remains diagnostic. The empty list is a valid latched
classification, so a later detail refresh cannot silently classify the signal or move it between
dimensions.

## Which signals enter estimation

The scoring job reads signals that are both:

- promoted, so repeated evidence has passed the discovery threshold;
- auto-discovered, so creating a user signal does not add scoring evidence.

It also excludes every score whose assigned signal is ignored. Ignore is the sole lifecycle
exception in the first version: priority, assignment, resolved, muted, archived, and regressed do
not affect eligibility. The predicate is centralized so a future reviewed-feedback policy can
replace this exception without changing every query.

The score is removed from estimator features, verdict numerators, verdict denominators, signal
occurrences, and attribution. Its screening decision remains available as an operational coverage
record, but it cannot restore the excluded verdict through another read path.

User-created signals remain visible as diagnostic context. Creating an annotation-origin cluster
does not directly alter the score.

A signal that has no eligible occurrence in the selected window contributes no session evidence.

## Dynamic impact estimation

The scoring job does not add signal occurrence rates. It estimates consequences in the dimension's
native quantity.

### Outcome

Signal membership is one feature in the calibrated Task Success model. Signals are fit jointly with
moments, final-output evidence, and other signal memberships. A newly promoted signal starts from a
hierarchical prior based on its flagger and evidence role. Its effect moves toward its own observed
association as sampled Task Success verdicts accumulate.

The model reports an associated change in task-success probability. It does not call that change
causal unless the signal definition itself establishes the endpoint.

### Reliability

A signal occurrence enters the terminal-failure union only when occurrence metadata proves the
session ended without recovery. A recovered provider or tool failure remains context and resource
evidence. It does not receive a smaller Reliability deduction.

Signals that describe a failure mode without proving terminal impact can help attribute observed
terminal failures but cannot create new ones.

### Cost and Speed

The estimator first computes exact resource waste from deterministic metrics whose avoidability is
proven. A deterministic repetition detector without redundancy proof is still modeled evidence. The
estimator then compares signal-positive sessions with matched signal-negative sessions to estimate
residual incremental spend or critical-path time.

Matching controls for behavior cluster, provider, model, input and output size, toolset, streaming
mode, and other stable workload fields when available. Several signals are fit together. The session
counterfactual is capped by actual spend and time.

A weak comparison shrinks the signal effect toward zero and widens its interval. A signal without a
credible clean comparison appears on the page with "effect not yet measured" rather than an invented
number.

### Safety

Only occurrences marked as confirmed agent-produced harm enter the Safety numerator. Exposure
occurrences are shown beside the score. A model-assigned `confirmedHarm` role still requires an
assistant-side confirmation field on each occurrence.

## Sampling and selection correction

Operational flagger screening is not uniform. Hints bypass sampling, clean sessions are sampled less,
and rate limiting can drop work. An occurrence rate over stored positives therefore is not a defect
rate.

Every logical screening decision stores:

- project, session, flagger slug, analysis hash, scoring-artifact version, stable decision id,
  attempt, and timestamp;
- selected or skipped;
- deterministic, hinted, uniform-sample, ordinary-sample, skipped, or rate-limited reason;
- inclusion probability;
- finding kind and conditional fields when matched.

Task Success uses the same configurable sampling and hint path as other flaggers. Outcome corrects
its verdicts with stored inclusion probabilities. Safety selects a complete detector suite per
session. Other sampled observations use inverse-probability weights. A decision without a known
inclusion probability is usable for an example or cause count, but not for a score.

Readers use only the latest analysis generation at the calculation cutoff and collapse its
append-only decision revisions by stable id. Superseded generations do not multiply occurrence or
examined counts. A retry reuses the generation's selection decision rather than drawing again.

## Avoiding detector and cluster inflation

The following invariants apply:

- duplicating a detector over the same sessions does not change a dimension;
- splitting one signal into equivalent child clusters does not multiply its effect;
- merging correlated signals does not erase the underlying measured outcome, failure, money, time,
  or harm;
- adding a new signal cannot reduce the estimated importance of unrelated signals through budget
  redistribution;
- more traffic or better discovery does not lower the score unless it reveals a changed estimand.

The joint estimator groups near-duplicate signals before attribution. The dimension score is based on
the session estimand, not on the number or identity of clusters.

## Promotion evidence and scoring evidence

Sessions used to discover and promote a signal cannot be the only sessions used to estimate its
effect. That would select the cluster for looking bad and then score the same evidence as an unbiased
sample.

The estimator uses post-promotion observations or cross-fitting. In cross-fitting, each session is
scored with signal-effect parameters fit without that session's fold. These facts remain current
estimator diagnostics and are not stored in daily score snapshots.

## Backfill

The Postgres migration assigns an empty `scoreEvidence` list to every existing signal and makes the
column non-null with an empty-list default. A separate one-time job then selects promoted,
non-deleted, system-discovered signals that have at least one published occurrence in the previous
30 days and still carry that known rollout value. Lifecycle state does not narrow the selection:
resolved, ignored, muted, regressed, assigned, and prioritized signals are included.

The job processes signals sequentially. It samples up to 200 of each signal's newest published,
failed, non-errored scores and applies the static mapping when one mapped flagger has a strict
majority of the full sample. Otherwise it asks the model to classify only the canonical signal name
and description; raw scores are not sent to the model. An all-false response leaves the signal
diagnostic with `scoreEvidence = []`.

No score-evidence version marker is added. Production runs the bundled worker entrypoint as an
independent ECS task exactly once. A dedicated ECS task-definition family prevents a second launch,
and a Postgres advisory lock prevents overlapping execution. Per-signal writes are conditional on
the row still being promoted, system-created, non-deleted, and empty.

Backfill does not invent historical screening probabilities. Old occurrences without measurable
selection remain examples and counts until a full score window of usable decisions accumulates.

## What the score never reads

- number of signals or distinct clusters;
- total raw occurrence count without a denominator;
- signal priority or assignee;
- resolved, muted, archived, or regressed state;
- escalation as a score multiplier;
- a model-assigned dimension without an evidence role;
- exposure as confirmed harm;
- an effect estimate trained only on the sessions that caused promotion.

Escalation remains useful for sorting incidents. It does not change a dimension estimator.

Ignored is intentionally different: scores assigned to ignored signals are excluded from current
and future calculations. Existing daily snapshots are not rewritten.
