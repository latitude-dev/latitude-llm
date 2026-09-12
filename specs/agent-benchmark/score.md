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

The session-end event triggers analysis that can create scores, signals, and screening decisions; it
does not freeze a session record or persist deterministic observations. Eligibility is derived from
the session activity timestamp and the shared debounce constant rather than a persisted session
assessment. The daily calculation reads retained telemetry and current persisted judgments when it
runs. Pending or failed sampled analysis is unexamined evidence and can prevent publication. Results
arriving later affect future daily snapshots, not earlier ones.

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
not call the interactive use-case once per session. The window adds population estimates and
counterfactual quantities where one session alone cannot determine them.

All overlap is resolved at session level. Window aggregation never adds independent generic losses
from metrics.

### Value and event evidence

Value evidence enters the session row in its native unit. Examples include spend, input tokens,
tool calls, memory operations, eligible sessions, critical-path duration, direct the task-failure judge
verdicts, cache opportunity, TTFT, and token throughput.

Event evidence does one of four jobs:

- establishes a the task-failure judge, terminal-failure, or confirmed-harm endpoint;
- provides issue context for a direct endpoint;
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
resource counterfactuals, and reference-run transforms.

Empirical resampling is not the sole uncertainty method for binary endpoint dimensions. Outcome,
Reliability, and Safety compute boundary-aware intervals for their success or failure probabilities.
A uniformly examined population uses an exact Clopper-Pearson binomial interval. A population split
across several known selection probabilities, which is what a project that changed its sampling rate
mid-window produces, groups into sub-strata and combines each one's exact bounds; the result is
conservative rather than a joint interval, and it is labelled as the stratified kind so it cannot
pass for exact. A propensity pattern that supports neither leaves the dimension unmeasured.

The endpoint interval remains non-degenerate when the window contains only successes, zero observed
failures, or zero observed harms. Reliability and Safety bounds pass through the monotone `p^20` or
`(1 - q)^100` transform in the opposite order where required. Composite bootstrap replicates draw
the native endpoint probability from the fitted boundary-aware model instead of repeatedly
resampling a constant outcome vector.

The page also reports coverage facts that the interval cannot explain by itself:

- eligible and readable session counts;
- conversation-analysis coverage;
- Cost-family applicability and readable-unit coverage;
- provider-reported, registry-estimated, explicitly free, and unpriced spend coverage;
- captured generation-content and known model-context coverage;
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

Outcome requires enough compatible sampled task-outcome verdicts and examined-population coverage. Cost requires enough
eligible and readable units in every required Cost family. A missing optional metric lowers its
reader coverage, while an unreadable required family withholds Cost. Speed requires enough sessions
with a complete, classifiable critical path. Safety requires a propensity-correctable population
examined by the complete Safety suite.

An unmeasured dimension has no numeric value. It does not display 100, 0, or a neutral midpoint, and
its absence prevents every other numeric score from being published.

### Dynamic attribution after scoring

The dimension formula computes the number before causes receive any credit. Attribution is a second
step used for ranking and explanation. It is resolved dynamically from the current selected window
and is not stored in daily snapshots.

Where the dimension has a defensible counterfactual, the engine computes two quantities:

1. **Attributed deficit**: the cause's Shapley share of the dimension's distance from its healthy
   counterfactual. These shares add to the current attributed deficit. A deterministic residual row
   absorbs estimation error and evidence that has no named cause.
2. **Fix gain**: the score change when that cause is removed while the other observed evidence stays
   fixed. Fix gains can overlap and do not need to add up.

Cost attributes each cause in its family's native units before translating the result into Cost
score points. Money remains available where the evidence supports it, but a context, tool, memory,
or recovery cause does not need a defensible price to appear. Speed attributes in time before
applying its ratio. Reliability can attribute terminal endpoints directly.

The initial Outcome and Safety sections use a smaller issue contract. Outcome reports
selection-corrected issue reach and failed reach, with raw examined overlap as coverage context.
Safety reports selection-corrected exposure and confirmed-harm reach, with raw examined counts as
coverage context. Issues rank by corrected failed or harmed reach, never by raw sampled overlap.
Each corrected value uses the stored inclusion probability for its observation path. If an overlap
depends on two sampled readers and their joint inclusion probability is unknown, the row remains
visible but unranked. These rows do not receive Shapley shares or estimated fix gains. The dimension
scores come from the task-failure judge and the confirmed-harm union, not from adding issue penalties.

Near-duplicate signals and observations of the same underlying event are grouped before attribution.
When attribution applies, exact Shapley attribution is used for 12 or fewer grouped causes. Larger
sets use deterministic, seeded permutation samples until the error target or computation ceiling is
reached. The interface shows the most meaningful rows and a residual; explanation limits never
remove evidence from the dimension estimator.

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
- the task-failure prompt or supported judge configuration;
- the Outcome sampling policy, eligibility contract, or coverage floors;
- the Cost or Speed signal-effect estimator;
- the Cost family weights, metric curves, overlap rules, residual-signal cap, or coverage floors;
- frozen fleet references;
- terminal failure or confirmed harm taxonomy;
- a reader floor or applicability rule;
- a detector change that materially alters observation coverage.

Each scoring version pins its deterministic telemetry readers and declares compatible
`scoringArtifactVersion` values for persisted model-produced flagger results. The daily job never
labels a mixture of incompatible the task-failure judge, Safety, or other sampled evidence as one version. It
re-evaluates retained session inputs with the target artifact where supported; evidence that cannot
be re-evaluated is unreadable for that reader. Publication is withheld until the compatible window
passes coverage and confidence gates. A scoring-version change therefore creates a marked boundary,
not a gradual blend of old and new verdicts.

The trend chart marks a version boundary. Snapshots on opposite sides remain visible but are not
presented as a continuous measurement.

Hosted and self-hosted deployments load the same formulas, prompts, reference bundles, and scoring
artifacts. A self-hoster that substitutes an unsupported the task-failure judge or Safety judge
model receives a distinct local scoring version, and its score is not presented as directly
comparable with the bundled version. A deployment without a supported judge configuration cannot
pass the Outcome or Safety publication gate.

## Part two: the five dimensions

### Outcome

#### Estimand

Outcome estimates the share of judgeable sessions that accomplished what the user asked. A session
succeeds when the agent resolves all material user goals that remain active at the end:

```text
sessionWeight[j] = 1 / inclusionProbability[j]
Outcome = 100 * sum(sessionWeight[j] * success[j]) / sum(sessionWeight[j])
```

Two strata, because they are known with different certainty.

The **deterministic census** holds sessions a reader proved could not have succeeded: no delivered
output at all, or a final generation that ended on an unreliable finish reason. These are facts
about the session rather than judgements of it, so they carry weight one and contribute no
successes. A session in the census leaves the sampled stratum entirely, even when the judge also
examined it, so the sample keeps its claim to be a random draw of the sessions it represents. The
census applies only where a task is readable: a session with no user-authored request has nothing to
have failed, and is not applicable to Outcome rather than a failure of it.

The **sampled stratum** is the `task-failure` judge's verdicts. It uses the project-configured
sampling infrastructure and stores the inclusion probability before judging the session, so the
ratio estimator can correct that selection. It does not infer a probability for each unexamined
session.

The judge returns success, failure, indeterminate, or not applicable. Success and failure are passed
and failed scores. The other verdicts lower coverage and do not enter the numerator or denominator.

A verdict counts only when its stored judgment version is one the scoring version supports. The
version names the prompt, the result schema, and the judge configuration that produced it, so a
deployment pointing its classifier at another model forms its own population instead of pooling two
judges under one label.

#### Evidence

| Evidence | Role |
| --- | --- |
| `sessions.task_success` | direct holistic success or failure reference verdict |
| `moments.strong_failure` | session context and a project issue candidate |
| `moments.failed_self_service` | session context and a project issue candidate |
| `moments.weak_failure` | session context and a project issue candidate |
| `sessions.no_output` | deterministic task-outcome failure when task applicability is readable |
| `spans.finish_failure` on the final generation | deterministic task-outcome failure when task applicability is readable |
| Outcome signals | recurring project issues linked to examined task-outcome results where possible |

No output and demonstrably broken final output can establish a deterministic failure when the
session contains a readable user task. Other findings explain failed sessions but do not apply
another deduction. Issue rows report their reach and overlap with examined failures without claiming
that removing the issue would recover a fixed number of Outcome points.

#### Denominator and coverage

The denominator contains examined sessions whose tasks can be judged, corrected by their stored
inclusion probabilities. Outcome is unmeasured until compatible task-outcome verdicts cover enough of
the eligible base to pass the versioned floor. A disabled task-failure flagger or unknown inclusion
probability prevents publication when the remaining direct endpoints are insufficient.

An unmeasured Outcome carries no number at all: no zero, no hundred, no neutral midpoint, and the
floor it missed is named. The deterministic census alone can never publish a score, since a project
the judge never examined would otherwise report zero on the strength of its failures being the only
evidence anyone gathered.

The first version judges the whole session. Task and goal episodes may become first-class Outcome
units in a future scoring version; existing episode extraction remains internal evidence until then.

#### Destination

Session Scores shows direct judgments and supporting evidence. Signals owns recurring Outcome issues
and their example sessions. Behavior-level Outcome analytics are a later extension.

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

- confirmed no output or unusable output pattern;
- an unreliable final finish with observable output damage;
- a provider error from which the session did not recover;
- a failed tool call after which the session made no successful progress;
- a malformed tool interaction that prevented completion;
- a Reliability signal that establishes equivalent terminal breakage.

Recovered provider and tool errors do not lower Reliability by a fractional amount. If the session
completed, they contribute recovery-family evidence to Cost and marginal critical-path time to
Speed. Paid retry generation or later prompt content contributes to Spend or Context only when it
can be attributed. They remain visible as resilience evidence on the Reliability page.

A structural defect only lowers Reliability when it prevents completion. Otherwise it can contribute
an inefficient tool-call equivalent, attributable downstream resources, and marginal time.

#### Denominator and coverage

The denominator is all eligible sessions with enough captured output and error telemetry to decide
whether completion was operationally successful. Unknown provider errors and unmapped finish reasons
lower coverage.

#### Destination

Sessions holds the failed runs. Tools holds tool-specific failures and malformed calls.

### Cost

#### Estimand

Cost measures the health of the agent's use of resources that create or predict cost. It intentionally
does not claim that a score of 80 means 80% of spend was unavoidable. Estimated recoverable money is
one valuable input, not the definition of the whole dimension.

The first version has five stable families:

| Family | Question | Canonical denominator |
| --- | --- | --- |
| spend | How much priced spend was recoverable? | priced usage microcents |
| context | How much readable model input was avoidable or poorly managed? | readable input tokens |
| tools | How often did tool use repeat, fail, or loop inefficiently? | readable tool calls |
| memory | How often did memory work repeat or undo itself? | readable memory operations |
| recovery | How often did completed sessions pay a recovery burden? | readable completed sessions |

Each metric maps its raw value through a versioned, monotone piecewise curve. Safe values contribute
no penalty, watch values contribute gradually, and poor values approach the metric's family cap. The
curve yields penalized units in the family's canonical unit. Metrics can use `resourceRatio`,
`eventRate`, or `sessionMean` to produce the raw value, but each definition states which one.

Within each session, exact source atoms take precedence over estimated ones, correlated observations
share an overlap group, and penalized units are capped by eligible units. Every canonical eligible
atom appears once in a family's denominator even when several metrics could read it. Metric claims
are unioned and capped rather than adding duplicate denominators. Window aggregation happens after
that resolution:

```text
familyPenalty[f] = clamp(sum(uniquePenalizedUnits[f]) / sum(uniqueEligibleUnits[f]), 0, 1)
CostPenalty = clamp(sum(familyWeight[f] * familyPenalty[f]) + residualSignalPenalty, 0, 1)
Cost = 100 * (1 - CostPenalty)
```

Family weights do not redistribute when a metric is not applicable. Applicability is not failure and
contributes zero penalized units. A family that applies but cannot be read lowers coverage and can
withhold the dimension instead of being treated as healthy. The weights, curves, caps, overlap
groups, and coverage floors live in one Cost scoring artifact and change only at a scoring-version
boundary.

#### Evidence

| Evidence | Cost family and native contribution |
| --- | --- |
| `cost.recoverable_spend_share` | spend: measured or estimated recoverable microcents over priced spend |
| `cost.cache_gap` | context: missed achievable cache tokens, with linked Spend evidence and a cross-family cap when pricing supports it |
| `context.redundant_input_share` | context: attributable redundant input-token equivalents |
| `context.avoidable_pressure` | context: known avoidable tokens consuming model context capacity |
| `tools.dead_surface` | context: tokenized unused definitions repeatedly sent to model calls |
| `tools.repeated_call` | tools: inefficient-call equivalents; downstream context or spend stays in its own family |
| `tools.thrashing` | tools: loop evidence sharing source atoms with repeated calls |
| `tools.call_failed` | recovery: completed sessions with a recovered tool incident |
| `tools.structural_defect` | tools: malformed interaction equivalents when the session recovered |
| memory repetition and rewrites | memory: inefficient-operation equivalents; downstream context stays in its own family |
| recovered provider failures | recovery and, when separately attributable, spend or context resource evidence |
| Cost signals | linked explanation of a family penalty or a capped residual association |

Tool and memory spans have no inherent billable cost in the current telemetry model. Their money or
context effect exists only when their output can be attributed to a later model input or to a paid
retry generation. Readers must not invent direct processing spend for those operations.

Raw context-window utilization is not automatically bad. `context.avoidable_pressure` penalizes only
the share attributable to known redundant source atoms. Total prompt size and model context limit
remain visible as explanatory context when avoidability is unknown.

Exact evidence takes precedence over modeled evidence. A signal linked to an existing source atom
explains that family penalty and adds no second penalty. Eligible unlinked Cost signals may contribute
only through a jointly estimated residual, grouped for correlation and capped by the scoring artifact.
A weak comparison produces "effect not yet measured."

#### Denominator and coverage

Coverage is reported by family and metric. Spend evidence distinguishes provider-reported,
registry-estimated, explicitly free, missing pair, missing catalog price, and unknown legacy cost.
Only explicitly free or local-runtime activity is known zero. Missing provider/model identity and a
catalog that declines to price a model are not silently treated as free.

The score assumes most or all priced values may be registry estimates. Provider-reported cost is
useful provenance, not a requirement for a readable Spend family. The scoring artifact and UI keep
estimated pricing visible rather than presenting it as invoice reconciliation.

Cost can still use readable context, tool, memory, and recovery evidence when some dollar pricing is
missing. The spend family is unavailable when its coverage floor fails; because family weights never
redistribute, a required unavailable family withholds the Cost score. Exact observations from partial
sessions remain visible in session assessment and cause lists.

Content readers report whether input messages, tool definitions, tool results, or memory-derived
content were captured. Normalized messages are not exact provider wire payloads, so attributed token
counts are estimates with identification bounds. Project intervals bootstrap complete sessions and
rerun the full family estimator; they do not sum item-level bounds.

#### Destination

Cost shows the family breakdown, cache opportunity, context use, pricing coverage, and recoverable
money. Tools and Memory show the operations that created the evidence. Sessions show the concrete
items and measurement state without presenting a per-session Cost score.

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
| `tools.repeated_call` | confirmed redundant duration or modeled incremental time for observed repetition |
| `tools.thrashing` | confirmed redundant duration or modeled incremental time for an observed loop |
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

Safety estimates the probability that a reference run of 100 sessions contains no confirmed
agent-caused harm:

```text
q = weighted sessions with confirmed harm / weighted examined sessions
Safety = 100 * (1 - q)^100
```

One confirmed failure in 100 examined sessions produces a point estimate near 37. One in 1,000
produces a point estimate near 90. The horizon is deliberately shorter than the score's session
target: over a thousand sessions the transform saturates, reading zero for any harm rate a project
with a readable examined population could distinguish. The interval communicates uncertainty,
especially when no failure was observed.

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
known. The denominator contains selected sessions whose entire suite completed **in one analysis
generation**; a timeout, rate limit, or skipped detector leaves the session unexamined, and so does
a suite whose members answered in different generations. A member that could not read the session is
not applicable rather than missing, so the suite still completes on the member that could.

Safety is unmeasured until the corrected examined population covers a full score window and passes
its sample floor. That floor is a sample size, not an interval width: rare events make the interval
wide by nature, and gating on width would withhold the dimension permanently. The floor and the
reference run are chosen together, because the zero-harm lower bound is
`100 * 0.05 ^ (referenceRun / examined)`.

Rate-limited hinted sessions are never examined, so they enter neither the numerator nor the
denominator, but they are tallied rather than ignored. They record `selected: false` at inclusion
probability one, and hinted Safety sessions are the ones most likely to contain harm, so losing too
many of them biases the rate downward instead of merely widening it. Past a configured share of the
hinted stratum, Safety is unmeasured.

An unsupported judgment version withholds the whole window rather than excluding the sessions that
carry it. A clean examination persists no score and so names no judge, so the same judge's clean
sessions cannot be filtered out alongside its harms; dropping only the harms would deflate the rate.
Outcome can exclude per session because every examined session there carries a verdict score.

#### Composite policy

A confirmed failure may also cap the composite. That cap is a product policy, not part of the Safety
estimator. If enabled, the snapshot stores it separately and the page attributes the capped points to
the policy rule rather than to a metric or signal.

#### Destination

Signals shows confirmed failures and examples. Settings shows detector coverage and policy controls.
