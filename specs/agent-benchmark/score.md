# The score and the dimensions

> Read [`README.md`](README.md) first. It defines the five dimensions, their user-facing meanings,
> and the rules governing scored evidence.

## Part one: the score

### What the score answers

The Agent Score summarizes the current production behavior of one project. It uses a bounded rolling
window and depends on no project history before that window.

The composite is a weighted mean of five different estimands. A dimension's number must be read with
its label. Outcome 80 and Cost 80 are both healthy readings, but they do not represent the same
quantity.

The score uses observed production evidence only. Simulations and user-created signals do not move
it. Scores assigned to ignored signals are excluded; other signal workflow state is irrelevant.

### Eligible sessions

The base population contains production sessions that satisfy all of these conditions:

- the session belongs to the project and organization being scored;
- it contains LLM activity;
- it is not synthetic traffic and has no simulation id;
- its last activity precedes the snapshot cutoff by the existing five-minute session-end debounce;
- it falls inside the selected window.

Each dimension and reader may narrow that base. A session is readable for one observation only when
the required telemetry was captured and the relevant detector could have run. Missing evidence is
never converted to a healthy verdict.

The session-end event triggers the analysis that creates scores, signals, and metrics; it does not
freeze a session record. Eligibility is derived from the session activity timestamp and the shared
debounce constant rather than a persisted session assessment. The daily calculation reads current
persisted sources when it runs. Pending or failed analysis is unexamined evidence and can prevent
publication. Results arriving later affect future daily snapshots, not earlier ones.

### The window

The score uses the shortest whole-week step that contains at least 1,000 eligible sessions:

1. 7 days
2. 14 days
3. 21 days
4. 28 days

The score is withheld below 200 eligible sessions. A project that does not reach 1,000 sessions uses
28 days once it passes the floor.

Whole-week steps keep weekday composition stable and make snapshots easy to compare. The selected
step is stored on every snapshot.

#### Hysteresis

The window does not shorten until the shorter step exceeds the target by 10%, and it does not
lengthen until the current step falls 10% below the target. This prevents a project near the boundary
from changing windows every day.

### The session evidence table

The daily job builds one logical row per eligible session from current source records. The row is not
persisted as a new copy of
telemetry. It is the bulk query boundary where the normalized facts defined in
[`session-assessment.md`](session-assessment.md) meet.

The session panel and daily job share the pure assessment resolver, evidence roles, deduplication,
and coverage semantics. Platform adapters provide single-session and bulk reads so the daily job does
not call the interactive use-case once per session. The window adds calibrated estimates and
counterfactual quantities where one session alone cannot determine them.

All overlap is resolved at session level. Window aggregation never adds independent generic losses
from metrics.

### Value and event evidence

Value evidence enters the session row in the dimension's native unit. Examples include spend,
critical-path duration, calibrated task-success probability, cache opportunity, TTFT, and token
throughput.

Event evidence does one of four jobs:

- establishes a terminal outcome;
- updates a task-success or safety probability;
- identifies a resource-consuming action as avoidable;
- attributes an already measured deficit to a named cause.

An event does not carry severity or points. Its effect depends on what happened to the session and on
the estimand it informs.

### Signals in the session row

Every promoted, auto-discovered signal with scoring evidence carries one or more evidence roles. The
roles determine how its occurrences enter the dimension estimators. Diagnostic signals can appear in
session assessment without entering a window estimator. [`signals.md`](signals.md) defines the schema
and the estimation rules.

Only occurrences inside the selected window appear. Scores assigned to ignored signals are removed
by the shared eligibility predicate before session evidence is resolved.

A signal count never enters a formula. A signal contributes through the sessions it touched and the
measured consequence on those sessions. The estimator evaluates overlapping signals jointly.
Splitting one cluster into several equivalent clusters must leave the dimension unchanged within
estimation error.

### The composite and publication gate

The composite exists only when all five dimensions pass their traffic, coverage, and confidence
floors:

```text
score = sum(dimensionScore[d] * weight[d])
```

| Dimension | Weight |
| --- | ---: |
| Outcome | 0.35 |
| Reliability | 0.25 |
| Cost | 0.15 |
| Speed | 0.15 |
| Safety | 0.10 |

Outcome carries the most weight because it measures whether the task succeeded. Reliability comes
next because an agent that cannot complete consistently is not useful even when successful sessions
are good. Cost and Speed are equal. Safety has the smallest mean weight because its dimension is
already risk-sensitive; a separate composite cap remains an optional product policy.

Weights never redistribute. If one dimension is unmeasured, Latitude publishes no composite and no
numeric dimension scores. The page still shows observed evidence and the missing requirements under
every dimension.

### Confidence

The score and every dimension carry a 95% interval. The daily job bootstraps complete sessions rather
than individual events, preserving correlation between metrics and signals on the same session.

The bootstrap repeats the entire dimension estimator, including inverse-probability weights,
counterfactual prediction, and the reference-run transform. Model calibration uncertainty is sampled
from its stored validation distribution.

The page also reports coverage facts that the interval cannot explain by itself:

- eligible and readable session counts;
- conversation-analysis coverage;
- priced-token and priced-span coverage;
- critical-path reconstruction coverage;
- per-flagger examined share and selection mechanism;
- the share of signal evidence corrected from non-uniform sampling;
- unmapped finish reasons and provider errors;
- disabled or archived detectors;
- the number of causes whose consequence remains unestimated.

Coverage can make a dimension unmeasured. It never changes an observed failure into success. A
dimension's candidate estimate remains internal until the publication gate passes for all five.

### When a dimension is not measured

A dimension is unmeasured when any required base is below its configured floor or when its readable
share is too small to describe the eligible population. Reader-specific floors live with the reader
and are frozen in the scoring version.

Outcome requires enough sampled Task Success verdicts and feature coverage. Cost requires enough
sessions with a complete priced resource base. Speed requires enough sessions with a complete,
classifiable critical path. Safety requires a propensity-correctable population examined by the
complete Safety suite.

An unmeasured dimension has no numeric value. It does not display 100, 0, or a neutral midpoint, and
its absence prevents every other numeric score from being published.

### Dynamic attribution after scoring

The dimension formula computes the number before causes receive any credit. Attribution is a second
step used for ranking and explanation. It is resolved dynamically from the current selected window
and is not stored in daily snapshots.

For each cause the engine computes two quantities:

1. **Attributed deficit**: the cause's Shapley share of the dimension's distance from its healthy
   counterfactual. These shares add to the current attributed deficit. A deterministic residual row
   absorbs estimation error and evidence that has no named cause.
2. **Fix gain**: the score change when that cause is removed while the other observed evidence stays
   fixed. Fix gains can overlap and do not need to add up.

Cost and Speed can attribute directly in money and time before applying the dimension ratio. Outcome,
Reliability, and Safety run the same counterfactual through their probability estimator and transform.

Near-duplicate signals and observations of the same underlying event are grouped before attribution.
Exact Shapley attribution is used for 12 or fewer grouped causes. Larger sets use deterministic,
seeded permutation samples until the error target or computation ceiling is reached. The interface
shows the most meaningful rows and a residual; explanation limits never remove evidence from the
dimension estimator.

The cause list never claims causality where the estimator only established association. A signal
row says "associated effect" unless the observation itself identifies avoidable work or a terminal
failure.

Only metrics with readable observations and signals with eligible occurrences in the window appear.
Because new source evidence can arrive after the daily snapshot, the cause list is labelled as
current evidence and is not required to reconstruct a historical snapshot.

### The daily snapshot

One immutable snapshot is stored per project and UTC date only when the publication gate passes. It
contains:

- organization id, project id, UTC date, and creation time;
- Agent Score point estimate and 95% interval;
- each of the five dimension point estimates and 95% intervals;
- scoring version, selected window length, and eligible-session count;
- any separately applied composite policy cap.

It contains no sessions, metrics, signals, causes, attribution, coverage breakdowns, model inputs, or
counterfactual rows. A failed or unavailable calculation writes no snapshot. Re-running a date with
an existing snapshot is a no-op.

### The scoring version

The scoring version changes when any of these changes:

- a dimension formula or reference-run horizon;
- composite weights or policy cap;
- the Outcome calibration model or its feature contract;
- the Task Success prompt or supported judge configuration;
- the signal-effect estimator or pooled priors;
- frozen fleet references;
- terminal failure or confirmed harm taxonomy;
- a reader floor or applicability rule;
- a detector change that materially alters observation coverage.

The trend chart marks a version boundary. Snapshots on opposite sides remain visible but are not
presented as a continuous measurement.

Hosted and self-hosted deployments load the same formulas, prompts, reference bundles, and
calibration artifacts. A self-hoster that substitutes an unsupported Task Success or Safety judge
model receives a distinct local scoring version, and its score is not presented as directly
comparable with the bundled version. A deployment without a supported judge configuration cannot
pass the Outcome or Safety publication gate.

## Part two: the five dimensions

### Outcome

#### Estimand

Outcome estimates the probability that a session accomplished what the user asked. A session
succeeds when the agent resolves all material user goals that remain active at the end:

```text
Outcome = 100 * sum(sessionWeight[j] * P(success[j] | evidence[j])) / sum(sessionWeight[j])
```

The sampled `task-success` flagger supplies direct holistic reference verdicts. It uses the same
project-configured, hint-aware sampling infrastructure as other flaggers. Stored inclusion
probabilities correct that selection. Conversation moments, final-output validity, and promoted
signals are jointly fitted features, not independent point deductions.

Task Success can return success, failure, indeterminate, or not applicable. Success and failure are
passed and failed scores. The other verdicts lower coverage. The model estimates unexamined sessions
from the reference verdicts and all eligible evidence, with cross-fitting so a session is never
predicted by parameters trained on its own verdict.

#### Evidence

| Evidence | Role |
| --- | --- |
| `sessions.task_success` | direct holistic success or failure reference verdict |
| `moments.strong_failure` | strong direct evidence that the user did not get the requested result |
| `moments.failed_self_service` | direct evidence that self-service failed before handoff |
| `moments.weak_failure` | probabilistic evidence of a stalled or hesitant result |
| `sessions.no_output` | terminal evidence of no delivered result |
| `spans.finish_failure` on the final generation | terminal evidence of a broken result |
| Outcome signals | signal-specific evidence whose effect is pooled and calibrated |

No output and demonstrably broken final output anchor the session probability at zero. A Task Success
verdict is the reference endpoint. Other features estimate unexamined traffic and attribute the
result. A new signal borrows a regularized prior from signals with the same evidence role until it has
enough independent verdicts to estimate its own effect.

#### Denominator and coverage

The denominator contains eligible sessions whose tasks can be judged. Outcome is unmeasured until
Task Success verdicts, readable features, and corrected sampling cover enough of the eligible base to
pass the versioned floor. A disabled Task Success flagger or unknown inclusion probability prevents
publication when the remaining direct endpoints are insufficient.

The first version judges the whole session. Task and goal episodes may become first-class Outcome
units in a future scoring version; existing episode extraction remains internal evidence until then.

#### Destination

Behaviors shows the conversation patterns carrying unsuccessful outcomes. Signals shows recurring
defects and example sessions.

### Reliability

#### Estimand

Reliability starts with the probability that one session completes without a terminal operational
failure:

```text
p = weighted terminally successful sessions / weighted readable sessions
Reliability = 100 * p^20
```

The power expresses a reference run of 20 sessions. Reliability 80 means the current operation has
an estimated 80% chance of completing 20 consecutive sessions without a terminal operational
failure.

Every user-facing Reliability value displays the one-session success rate `p` beside `100 * p^20`.
The rate is explanatory context, not a second dimension score.

#### Terminal failure

A session fails operationally when it cannot produce a structurally usable completion because of:

- no output;
- an unreliable final finish with observable output damage;
- a provider error from which the session did not recover;
- a failed tool call after which the session made no successful progress;
- a malformed tool interaction that prevented completion;
- a Reliability signal that establishes equivalent terminal breakage.

Recovered provider and tool errors do not lower Reliability by a fractional amount. If the session
completed, they contribute their observed retry cost and critical-path time to Cost and Speed. They
remain visible as resilience evidence on the Reliability page.

A structural defect only lowers Reliability when it prevents completion. Otherwise it is avoidable
time and possibly avoidable spend.

#### Denominator and coverage

The denominator is all eligible sessions with enough captured output and error telemetry to decide
whether completion was operationally successful. Unknown provider errors and unmapped finish reasons
lower coverage.

#### Destination

Sessions holds the failed runs. Tools holds tool-specific failures and malformed calls.

### Cost

#### Estimand

Cost measures the share of observed spend that was necessary:

```text
avoidableSpend[j] = clamp(actualSpend[j] - necessarySpend[j], 0, actualSpend[j])
Cost = 100 * (1 - sum(avoidableSpend) / sum(actualSpend))
```

`necessarySpend` is the counterfactual spend for the same work without identified waste. The
counterfactual is computed once per session. Independent metric deductions are never summed beyond
the session's actual spend.

#### Evidence

| Evidence | Native contribution |
| --- | --- |
| `cost.cache_gap` | spend recoverable at the traffic's achievable cache ceiling |
| `tools.dead_surface` | model-input cost of definitions that remained unused over their observation period |
| `tools.repeated_call` | spend attributable to a repeated call with unchanged input and output |
| `tools.thrashing` | spend attributable to a consecutive repeated-call loop |
| `memory.noop_rewrite` | processing cost of a write that changed nothing |
| `memory.reverted_write` | processing cost of a write later undone in the same session |
| `memory.repeated_zero_hit` | processing cost of repeating the same fruitless search |
| recovered provider and tool failures | retry spend that was not needed in the successful counterfactual |
| Cost signals | incremental spend against matched clean sessions |

Exact resource evidence takes precedence over modeled signal effects. The joint counterfactual uses
signals only for residual spend not already explained by deterministic readers.

#### Denominator and coverage

The ratio uses only sessions whose complete spend-bearing activity is priced or explicitly
zero-priced. A session with missing pricing is excluded from both numerator and denominator, while
its readable facts remain visible. Coverage reports the excluded workload.

If every otherwise readable session is fully known to be zero-priced, Cost is 100 because no money
was wasted. Unknown prices never receive that treatment.

#### Destination

Cost shows cache opportunity and money recoverable. Tools and Memory show the operations that created
waste.

### Speed

#### Estimand

Speed measures the share of user-visible critical-path time that was necessary:

```text
avoidableTime[j] = clamp(observedCriticalPath[j] - necessaryCriticalPath[j], 0, observedCriticalPath[j])
Speed = 100 * (1 - sum(avoidableTime) / sum(observedCriticalPath))
```

Critical-path reconstruction prevents concurrent spans from being counted twice. Background work
that does not delay completion remains diagnostic and does not lower Speed.

#### Evidence

| Evidence | Native contribution |
| --- | --- |
| `spans.ttft` | TTFT beyond the frozen expectation for the same provider, model, input bucket, and streaming mode |
| `spans.throughput` | generation time beyond the frozen cohort expectation |
| `tools.repeated_call` | critical-path duration of a redundant round trip |
| `tools.thrashing` | critical-path duration of the repeated loop |
| `tools.structural_defect` | failed round trip and correction time when completion recovered |
| recovered provider and tool failures | retry time on the successful path |
| `memory.repeated_zero_hit` | critical-path duration of the repeated search |
| `moments.weak_failure` | excess wait associated with a stall, after other readers are accounted for |
| Speed signals | incremental critical-path duration against matched clean sessions |

The matching model controls for behavior cluster, provider, model, input size, output size, toolset,
and streaming mode when those fields are available. Signal effects shrink toward zero when the clean
comparison is weak.

#### Denominator and coverage

The denominator contains sessions with a complete reconstructable critical path. Every
latency-bearing segment required by the counterfactual must be classified or have a frozen reference.
An exact repeated-work duration from an incomplete session remains visible, but the whole session is
excluded from the project ratio so unknown time is not treated as necessary. Coverage reports these
exclusions.

#### Destination

Sessions shows slow critical paths and retries. Tools and Memory show repeated work.

### Safety

#### Estimand

Safety estimates the probability that a reference run of 1,000 sessions contains no confirmed
agent-caused harm:

```text
q = weighted sessions with confirmed harm / weighted examined sessions
Safety = 100 * (1 - q)^1000
```

One confirmed failure in 1,000 examined sessions produces a point estimate near 37. One in 10,000
produces a point estimate near 90. The interval communicates uncertainty, especially when no failure
was observed.

#### Confirmed failure

The first version includes:

- the assistant revealed personal data it should not have surfaced;
- the assistant complied with a prompt injection or instruction-hierarchy attack.

Exposure alone never enters `q`. User-authored personal data, injection attempts, and unsafe requests
appear as context.

Multiple safety detectors on one session produce one failed session. New safety signals enter the
union only when their evidence role requires confirmation of agent-produced harm. A generic Safety
classification is not enough. The same jailbreaking judge can confirm harm when its structured
verdict records both the attempted attack and the assistant action that complied.

#### Denominator and coverage

Safety selects a session once and runs the complete launch detector suite on it. Hinted sessions and
the configurable sample of unhinted sessions store their inclusion probabilities before results are
known. The denominator contains selected sessions whose entire suite completed; a timeout, rate
limit, or skipped detector leaves the session unexamined. Safety is unmeasured until the corrected
examined population covers a full score window and passes its sample floor.

#### Composite policy

A confirmed failure may also cap the composite. That cap is a product policy, not part of the Safety
estimator. If enabled, the snapshot stores it separately and the page attributes the capped points to
the policy rule rather than to a metric or signal.

#### Destination

Signals shows confirmed failures and examples. Settings shows detector coverage and policy controls.
