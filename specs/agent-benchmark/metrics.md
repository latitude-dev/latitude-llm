# Metrics

> Read [`score.md`](score.md) for the dimension estimands and
> [`session-assessment.md`](session-assessment.md) for how observations tell one session's story.
> This catalogue defines the observations used by both.

A metric does not own an independent point budget. It returns evidence in a native form: an endpoint,
probability feature, amount of spend, token count, operation count, session rate, duration on the
critical path, or confirmed safety failure. Cost metrics also declare how that evidence enters one
of the fixed Cost families.

## Metric contract

Every metric definition specifies:

| Field | Meaning |
| --- | --- |
| ID | stable identifier used in evidence, deduplication, and cause rows |
| dimensions | estimands the observation can inform |
| Cost family | spend, context, tools, memory, or recovery when the metric informs Cost |
| evidence role | endpoint, outcome feature, resource evidence, or confirmed harm |
| reader | telemetry and grouping used to produce the observation |
| evaluation | raw value, aggregation mode, monotone curve, eligible units, and penalized units |
| counterfactual | what the same session would look like without the defect, where needed |
| overlap rule | how the reader avoids duplicating evidence from another metric |
| guard | missing or ambiguous telemetry that makes the observation unreadable |
| coverage | population over which the observation can be trusted |

The shared session-assessment resolver deduplicates metric observations before the daily job
aggregates a dimension.

## Telemetry guards

Missing telemetry is not agent behavior. Readers follow two common rules:

- A missing field cannot establish a failure. The session is unreadable for that observation.
- Empty grouping fields are excluded. Hashing an empty argument, query, or content field would make
  unrelated actions collide.

Readers also expose their readable count. A dimension can use the observations it has while reporting
partial coverage, but it becomes unmeasured when the missing share crosses the versioned floor.

## Cost metric evaluation

Every scored Cost observation returns a structured evaluation rather than generic points:

```ts
type CostMetricEvaluation = {
  metricId: string
  family: "spend" | "context" | "tools" | "memory" | "recovery"
  aggregation: "resourceRatio" | "eventRate" | "sessionMean"
  applicability: "applicable" | "notApplicable"
  readability: "readable" | "unreadable"
  rawValue?: number
  status?: "healthy" | "watch" | "poor"
  penalty?: number
  eligibleUnits?: number
  penalizedUnits?: number
  sourceClaims: Array<{
    atomId: string
    eligibleUnits: number
    penalizedUnits: number
  }>
  nativeImpact?: {
    unit: string
    point: number
    lower?: number
    upper?: number
    interpretation?: "identificationBound" | "confidenceInterval"
  }
}
```

The scoring artifact owns the metric's smooth piecewise curve and threshold labels. A step function
is not used at a safe-range boundary. `notApplicable` is a real result with no penalty.
`unreadable` is a coverage result and cannot be converted to healthy. Source atoms identify the
smallest resource that can be claimed once, such as a generation, input segment, tool call, memory
event, or recovered incident. Source claims are an internal aggregation contract; public session
assessment exposes the resulting counts, native impact, and navigable anchors rather than every
denominator atom.

A curve is an ordered list of `{ rawValue, penalty }` points plus healthy/watch/poor boundaries.
Penalty is linearly interpolated between adjacent points and clamped outside the first and last
point. Artifact validation requires ascending raw values, non-decreasing penalties in 0 through 1,
and status boundaries consistent with those points. For a readable observation:

```text
penalty = interpolate(metricCurve, rawValue)
penalizedUnits = penalty * familyEligibleUnits
```

`familyEligibleUnits` uses the family's canonical denominator. The resolver unions those eligibility
atoms across metrics before aggregation, so adding a second reader over the same tool calls does not
double the denominator. Overlap groups determine whether competing penalty claims use exact-first,
maximum, union, or a named combined cap.

### Cost launch catalog

This is the required first-version catalog. Curve points remain provisional until the PR 3 shadow
calibration freezes them. Every negative metric starts at zero penalty when its adverse-event or
avoidable-resource share is zero; the artifact defines the end of the healthy range, the watch
range, and the saturation point. A healthy label therefore means the raw value is inside a measured
safe range, not merely that no detector emitted a finding.

| Metric | Family | Aggregation | Raw value | Applicability |
| --- | --- | --- | --- | --- |
| `cost.recoverable_spend_share` | spend | `resourceRatio` | deduplicated recoverable microcents / priced usage microcents | at least one priced usage span |
| `cost.cache_gap` | context | `resourceRatio` | missed achievable cache tokens / achievable cache tokens | cache-eligible calls pass evidence guards |
| `context.redundant_input_share` | context | `resourceRatio` | attributable redundant input tokens / readable input tokens | generation content is captured |
| `context.avoidable_pressure` | context | `sessionMean` | attributable redundant input tokens / model context limit | content and context limit are readable |
| `tools.repeated_call` | tools | `eventRate` | inefficient-call equivalents / readable tool calls | at least two comparable calls |
| `tools.thrashing` | tools | `eventRate` | calls in qualifying loops / readable tool calls | at least three comparable calls; overlaps repeated calls |
| `tools.structural_defect` | tools | `eventRate` | recovered malformed interactions / readable tool calls | complete call/result structure is captured |
| `tools.dead_surface` | context | `resourceRatio` | unused definition tokens / readable input tokens | definition observation period is complete |
| `memory.repeated_zero_hit` | memory | `eventRate` | repeated guarded zero-hit operations / readable memory reads | memory reads and result counts are captured |
| `memory.noop_rewrite` | memory | `eventRate` | guarded no-op writes / readable memory writes | current and previous hashes are non-empty |
| `memory.reverted_write` | memory | `eventRate` | reverted intermediate writes / readable memory writes | same-session record history is readable |
| `recovery.recovered_incident_rate` | recovery | `eventRate` | completed sessions with recovered provider or tool incidents / readable completed sessions | completion and incident chronology are readable |

One source fact has one primary behavioral family. If the same fact also has attributable money, a
derived spend atom can enter Spend only under a declared cross-family overlap group and combined cap.
For example, a recovered failed tool call is counted by `recovery.recovered_incident_rate`, not again
as a tool-family failure. Its tool page can still be the destination. Distinct downstream input
tokens, paid generation spend, or critical-path time are separate resources and may inform Context,
Spend, or Speed through their own source atoms.

Metric definitions do not choose their own share of the final 100 points. They convert evidence to
the canonical units of a stable family. Family weights and within-family caps live together in the
versioned Cost artifact. Adding a scored metric requires an overlap audit, shadow calibration, and a
scoring-version change.

### Complete resource bases

Session assessment can show an exact observation from partially captured telemetry. Project-level
Cost and Speed are stricter:

- Cost uses every readable metric denominator but withholds the dimension when a required family's
  eligible or readable coverage falls below its versioned floor. Missing pricing affects the spend
  family and modeled money only; it does not erase independently readable tool or context evidence.
- Speed uses a session only when its critical path is reconstructable and every latency-bearing
  segment required by the counterfactual is classified or has a frozen reference.

An incomplete Speed session is excluded from that dimension's numerator and denominator. An
unreadable Cost observation is excluded from its metric denominator and counted in coverage. Exact
facts remain visible as evidence. The page reports excluded workload and coverage so selection is
not hidden.

## Frozen latency references

TTFT and generation throughput have a direction but no universal scale. Latitude compares them with
frozen distributions for equivalent model calls.

### Cohort keys

| Key | Reason |
| --- | --- |
| provider | the same model behaves differently across serving platforms |
| model | reasoning and small chat models are not comparable |
| input token bucket | prompt size changes startup latency; buckets are under 1k, 1k to 4k, 4k to 16k, 16k to 64k, and over 64k |
| streaming | non-streaming TTFT collapses into total duration |

Output token bucket joins the throughput cohort because longer generations provide a more stable
rate estimate.

The expected counterfactual is the cohort median, not a pass threshold. Excess duration is the
positive difference between the observed call and that expectation. A call faster than the median
has zero avoidable time; it does not earn credit that can erase waste elsewhere.

The distributions are frozen into the scoring version. A live fleet lookup would let other projects
move a project's score. Frozen values also keep self-hosted scoring independent of Latitude's hosted
fleet.

The fallback chain is provider, model, token bucket, and streaming mode; then provider and model;
then unmeasured. It never falls back to one distribution across models. Existing percentile sample
gates at 30, 100, and 1,000 observations remain the minimum evidence for published cohort summaries.

# Sessions

## `sessions.task_success`

- Dimension: Outcome.
- Evidence role: holistic task-outcome verdict.
- Reader: passed and failed scores from the sampled `task-success` flagger.

The verdict concerns the complete session. Success means the agent resolved all material user goals
that remained active at the end. Failure means at least one material goal failed, was abandoned, or
remained unresolved. Indeterminate and not-applicable classifications are coverage facts, not
scores.

The reader corrects configurable, hint-aware sampling with the stored inclusion probability. A
failed score can create or join a signal. A passed score never enters signal discovery.

## `sessions.no_output`

- Dimensions: Outcome, Reliability.
- Evidence role: terminal task failure and terminal operational failure.
- Reader: the shared deterministic output-content reader used by the `empty-response` flagger on the
  last assistant turn.

A final assistant turn contains delivered output when it has non-whitespace response text or at
least one tool call. Reasoning alone is not a delivered result. A turn with neither response text nor
a tool call is a terminal no-output finding. Non-empty repeated-character output requires explicit
schema, requested-output-contract, or semantic usability evidence that it could not satisfy the
task. This keeps valid compact answers such as `111` out of the terminal path.

A malformed tool call still prevents a no-output finding because the assistant produced a tool call;
the structural reader can independently classify that call as terminal when it prevented usable
completion.

Blank-only turns with no tool call and confirmed unusable patterns anchor Outcome success at zero
and fail Reliability because no usable completion was delivered. An unconfirmed pattern is modeled
Outcome evidence or diagnostic context; it is not a terminal failure.

The flagger returns no match when no assistant message was captured. That case is unreadable rather
than failed. [`flaggers.md`](flaggers.md#repeated-character-output-needs-usability-evidence) defines
the structured finding kinds.

# Spans

## `spans.finish_failure`

- Dimensions: Outcome, Reliability, Speed.
- Evidence role: terminal endpoint on the final generation; resource evidence on an earlier
  generation.
- Reader: classified finish reason plus observable output damage where required.

A shared classifier maps provider-native finish reasons to `clean`, `unreliable`, or `unmapped`.
Clean includes normal stops, caller-forced stops, tool-call continuations, and explicit refusals.
Whether a refusal was correct belongs to Outcome signal evidence. Unreliable includes truncation,
provider content filters, guardrail intervention, and malformed function calls.

The classified value retains the raw and normalized reason plus a bounded kind. Length-related kinds
carry `requiresOutputDamage: true`; other unreliable kinds carry `false`. Unmapped raw values remain
visible rather than being guessed into a known category.

Truncation requires two observations: an unreliable length-related finish reason and malformed or
incomplete output from `output-schema-validation`. A deliberately short output limit can end with
`length` while still returning a complete value. Content filters, guardrail interventions, and
malformed calls require no second observation.

An unreliable final generation anchors Outcome at zero and creates a Reliability failure. The same
condition on an earlier generation contributes the wasted generation's critical-path duration to
Speed if the session recovered. Position is metadata on one metric, not a second metric or severity.

Unmapped values lower coverage. A periodic fleet report keeps the classifier current.

Span responses expose raw finish reasons beside their classifications. The same browser-safe span
contract is used by trace and session span readers, so detail views show known and unmapped endpoint
values consistently without persisting derived classifier columns.

## `spans.provider_error`

- Dimensions: Reliability, Cost, Speed.
- Evidence role: terminal endpoint when unrecovered; resource evidence when recovered.
- Reader: a named provider-error classifier over `error_type` on chat spans.

Rate limiting, overload, service failure, and provider rejection qualify. Generic span error status
does not, because SDKs disagree about whether handled exceptions set it.

The named classifier returns `rateLimit`, `overload`, `serviceFailure`, or `providerRejection` only
from a recognized `error_type`. An absent type produces no provider-error observation. An unknown or
generic type remains visible as `unmapped` and lowers reader coverage; status code alone cannot
promote it.

The browser-safe session endpoint resolver orders the complete session span list by end time, start
time, trace id, and span id. It assigns both the full chronology's `spanIndex` and the generation-only
`generationIndex`, and marks only the last generation `final`. A generation counts as later progress
only when it starts after the failed generation ended, so overlapping sibling calls cannot be
mistaken for a retry. A successful generation has no error status, no error type, and no unreliable
or unmapped finish reason.

The reader pairs the error with that later successful progress and the shared usable-completion
predicate:

- no later successful generation or no usable completion: terminal Reliability failure;
- later success plus usable completion: recovered retry evidence for Cost and Speed.

The finding carries `recovered`, `sameSubjectRecovered`, the failed span index, successful span
indices when present, exact stored cost, and elapsed duration derived from the retained span
timestamps. The same-subject marker compares non-empty normalized provider names and remains a
separate fact: a provider may recover even when the session never delivers a completion. Unmapped
errors stay on the classified endpoint but do not become provider-error findings or prove a
successful retry.

This resolver is pure and runs from retained spans and the captured session output. It writes no
provider-finding score, event, or other derived row. Recovery is factual metadata, not a score band.

## `spans.ttft`

- Dimension: Speed.
- Evidence role: value-based critical-path excess.
- Reader: time to first token on streaming chat spans.

For each readable span:

```text
excessTTFT = max(0, observedTTFT - frozenExpectedTTFT[cohort])
```

Only the portion on the session's critical path contributes. Calls without a usable cohort reference
remain visible as raw latency but do not enter avoidable time.

## `spans.throughput`

- Dimension: Speed.
- Evidence role: value-based critical-path excess.
- Reader: output tokens and generation duration after first token.

The frozen cohort supplies expected tokens per second. The counterfactual generation duration uses
the session's observed output token count:

```text
expectedDuration = outputTokens / expectedTokensPerSecond
excessGenerationTime = max(0, observedGenerationDuration - expectedDuration)
```

This compares the same produced output rather than rewarding short answers.

# Tools

## `tools.call_failed`

- Dimensions: Reliability, Cost, Speed.
- Cost family: recovery when recovered.
- Evidence role: terminal endpoint when unrecovered; inefficient-call and recovery evidence when
  recovered.
- Reader: the shared deterministic error-finding reader used by `tool-call-errors`.

A tool response is a failure only when the response contract or structured payload establishes it.
The current blanket treatment of every HTTP 400 through 499 status as expected is not sufficient;
the reader needs a caller-declared expected-status contract before it can exclude one.
A later successful call or other successful progress can recover the session even when it used a
different tool. Reliability asks whether the agent completed, not whether one integration was flaky.

Recovered failures remain observable so the recovered session enters Recovery and marginal
critical-path duration can enter Speed. A tool span has no
inherent billable spend. Money or context enters only when a paid retry generation or later model
input can be attributed to the incident. Recovered failures do not open signal-discovery work
automatically. [`flaggers.md`](flaggers.md) defines that separation.

Attribution also records same-tool recovery. The session-wide marker answers whether the run
completed; the tool-specific marker tells the user which integration needs work.

## `tools.structural_defect`

- Dimensions: Reliability, Cost, Speed.
- Cost family: tools when recovered.
- Evidence role: terminal endpoint only when completion failed; otherwise inefficient-call evidence.
- Reader: malformed, duplicate-id, and unknown-id findings from the shared deterministic tool reader
  used by `tool-call-errors`.

A call with a missing id or name, duplicate call id, or response referencing no known call qualifies.
A tool absent from captured definitions does not. Missing definitions usually indicate incomplete
instrumentation.

The unknown-id case is readable only when at least one tool call survived in the window. Input
truncation can otherwise leave an orphan response after removing the original call.

If the session recovered, Tools receives the defective-call equivalent and Speed receives only
marginal correction time. Spend or context requires separate
attribution to a later model generation. If the defect prevented a usable completion, Reliability
fails and Cost or Speed do not automatically treat the terminal failure's full resources as waste.

## `tools.repeated_call`

- Dimensions: Cost, Speed.
- Cost family: tools; attributable later prompt content also informs context.
- Evidence role: observed repetition with confirmed or modeled inefficient-call equivalents.
- Reader: repeated tool name, input hash, and output hash within one session.

The same arguments must produce the same result. Calls with empty captured input or output are
unreadable. Equal results establish repetition but not avoidability: polling can return the same
status across several necessary checks, and a non-consecutive revisit can be legitimate.

Later identical calls contribute exact inefficient-call equivalents only when tool semantics or
captured state-version evidence proves the earlier result remained valid and the call could not
advance external work. Otherwise the repetition is a modeled feature or context. Its Cost curve
uses repeats beyond the first over readable tool calls, with polling-safe applicability and a family
cap. Critical-path time is separate Speed evidence. Tool arguments in model output and call/results
included in later model inputs can contribute bounded context or spend evidence when attributed.
`tools.thrashing` can describe the same repetitions; shared source atoms deduplicate them.

## `tools.thrashing`

- Dimensions: Cost, Speed.
- Cost family: tools.
- Evidence role: observed loop with confirmed or modeled inefficient-call equivalents and a named
  cause.
- Reader: three or more consecutive identical tool names, inputs, and outputs.

This is the deterministic half of the `trashing` flagger. Tool dominance without identical results
is only a screening hint for the LLM flagger and does not establish waste.

Thrashing names the loop for attribution. Identical output does not by itself prove that a poll or
time-dependent read was avoidable. Exact inefficient-call evidence requires the same redundancy
proof as `tools.repeated_call`; otherwise its effect is modeled or remains context. It shares source
atoms and an overlap group with repeated calls, so the loop never adds the same calls twice.

## `tools.dead_surface`

- Dimension: Cost.
- Cost family: context.
- Evidence role: value-based redundant input tokens with optional modeled spend.
- Reader: tool definitions and calls over the definition's observation period.

A definition qualifies when it has been sent throughout a minimum observation period and has never
been called. Its native effect is the estimated serialized token count included in each readable
model request:

```text
redundantDefinitionTokens = sum(estimatedSerializedDefinitionTokens)
modeledSavings = redundantDefinitionTokens * applicableInputTokenPrice
```

Definitions merely unused in the current score window do not qualify. The observation period avoids
penalizing a legitimate tool that was not needed this week.

Normalized definitions do not preserve every provider's exact wire representation. Token counts use
the provider tokenizer when available and the shared approximation otherwise, and carry an
identification bound. Modeled savings are secondary and unavailable when pricing is unreadable.

A called name with no matching definition reports a coverage warning because MCP namespace
differences can make a used tool look dead.

# Memory

Memory metrics apply only to captured memory activity. Memory operations have no inherent billable
cost in the current span model. The family measures inefficient operation equivalents; a money or
context effect requires attribution to a later model generation.

## `memory.repeated_zero_hit`

- Dimensions: Cost, Speed.
- Cost family: memory.
- Evidence role: repeated-operation equivalents and marginal critical-path time.
- Reader: the same non-empty query repeated in one session with zero results every time.

The first search is the baseline. Later identical zero-hit searches contribute repeated-operation
equivalents and marginal critical-path duration when they delayed completion. A single zero-hit
search is context, not positive evidence. Query text must be non-empty and content capture must be
readable.

## `memory.noop_rewrite`

- Dimension: Cost.
- Cost family: memory.
- Evidence role: inefficient-write equivalents.
- Reader: a write whose non-empty content hash matches the record's prior hash.

The write contributes one inefficient-operation equivalent. Empty hashes are unreadable. Content
later placed in an LLM input is separate bounded context evidence; no direct processing spend is
invented.

## `memory.reverted_write`

- Dimension: Cost.
- Cost family: memory.
- Evidence role: inefficient-write equivalents.
- Reader: a write restored to the record's prior non-empty content hash within the same session.

The intermediate write and the operation that restores the earlier value are candidate inefficient
operations. The session resolver prevents overlap with a no-op cause. Downstream model-input or paid
retry effects require separate attribution.

# Recovery

## `recovery.recovered_incident_rate`

- Dimension: Cost.
- Cost family: recovery.
- Evidence role: completed-session event rate.
- Reader: the union of recovered provider and failed-tool incidents after chronology and usable
  completion are resolved.

Each readable completed session contributes at most one penalized recovery unit regardless of how
many detectors describe the same incident. Incident count and type remain visible for diagnosis.
Terminal incidents do not enter this Cost metric because the successful counterfactual is not
observed; they remain Outcome or Reliability evidence. Distinct retry generation spend, later input
content, inefficient tool calls, and marginal critical-path segments enter their own metrics only
when the corresponding source atoms can be attributed.

# Cost

## `cost.recoverable_spend_share`

- Dimension: Cost.
- Cost family: spend.
- Evidence role: resource-ratio evidence in microcents.
- Reader: the union of attributable, deduplicated spend atoms from recovered generations, cache
  opportunity, and other readers that can identify a paid model-input or model-output effect.

The metric divides recoverable microcents by priced usage microcents after session-level source-atom
deduplication. Provider-reported total cost remains valid observed spend, while component savings can
still be registry-estimated. The observation reports which portions are provider-reported,
registry-estimated, explicitly free, or unpriced. Tool and memory operations enter only through an
attributed paid generation.

## `cost.cache_gap`

- Dimension: Cost.
- Cost family: context, with modeled savings linked to Spend through the cache overlap group when
  pricing is readable.
- Evidence role: missed achievable cache-token ratio with optional modeled savings.
- Reader: measured cache use and achievable cache use for the project's own request cadence.

The achievable ceiling accounts for each model's documented cache lifetime and for how much
cache-eligible input arrived soon enough behind a matching request. Traffic with no possible cache
reuse has no gap.

```text
avoidableCachedTokens = max(0, achievableCachedTokens - measuredCachedTokens)
avoidableSpend = avoidableCachedTokens * applicableTokenSaving
```

The existing cache-economics reader supplies cadence, model TTL, cache prices, and minimum evidence
guards. It currently estimates the ceiling from timing and prompt volume, so it can overstate
achievable prefix reuse. PR 3 must compare readable prompt prefixes where content exists and report
the cadence-only result as an upper identification bound otherwise.

The reader reports the share of input tokens for which a ceiling could be computed. Missing models
or content do not count as either fully cached or fully wasted. The existing minimum of 20 calls,
average input of 1,024 tokens, and 10 percentage-point material gap are launch candidates, not
automatically the score curve. The final curve is calibrated and frozen in the Cost artifact.

## `context.redundant_input_share`

- Dimension: Cost.
- Cost family: context.
- Evidence role: resource-ratio evidence in estimated input-token equivalents.
- Reader: repeated content atoms attributable to earlier tool calls, tool results, memory results,
  prior generations, or other retained prompt segments.

The reader compares every readable generation input in the session, not only the latest session
conversation window. An atom is penalized only when another reader establishes that the underlying
work or content was redundant. Mere recurrence can be necessary conversation history and remains
context.

Logical `GenAIMessage` content is not exact provider serialization. Use provider-aware tokenization
when supported and the existing `o200k_base` approximation otherwise. Reconcile estimated atom totals
to reported input-token totals and return an identification bound for framing, hidden provider
content, and cache-class ambiguity. Never claim exact direct, cache-read, or cache-write placement
from logical messages alone.

## `context.avoidable_pressure`

- Dimension: Cost.
- Cost family: context.
- Evidence role: session-mean evidence about known avoidable context relative to model capacity.
- Reader: attributable redundant input tokens and `@domain/models` context limits.

```text
avoidablePressure = attributableRedundantInputTokens / modelContextLimit
```

This metric answers how much scarce context capacity known redundant content consumed. Raw context
utilization does not score because a large prompt can be necessary. Calls with unknown context limits
remain visible and unreadable for this metric.

# Moments

Conversation intelligence produces Outcome issue evidence. It does not assign a fixed score
deduction.

## `moments.strong_failure`

- Dimension: Outcome.
- Evidence role: strong negative Outcome issue evidence.
- Reader: correction, repeated-information request, abandonment, or explicit frustration.

These moments quote the user's next turn as evidence. The initial Outcome estimator does not assign
them independent points. Multiple strong moments on one session collapse into one issue input.

## `moments.failed_self_service`

- Dimension: Outcome.
- Evidence role: paired negative Outcome issue evidence.
- Reader: escalation to a human after a correction or frustration, ordered by message index.

An intended handoff is not failure. The earlier negative moment establishes that self-service failed
before the handoff.

## `moments.weak_failure`

- Dimensions: Outcome, Speed.
- Evidence role: Outcome issue evidence and residual time attribution.
- Reader: stalled or hesitant behavior.

For Outcome, the first version reports the issue's reach and overlap with examined Task Success
failures. For Speed, it can attribute excess critical-path time left unexplained after deterministic
latency and retry readers. It never invents a fixed duration.

# Safety

## `safety.confirmed_failure`

- Dimension: Safety.
- Evidence role: confirmed agent-caused harm.
- Reader: assistant-side PII disclosure or confirmed compliance with an injection.

Multiple findings on one session produce one failed safety session. The finding type remains on the
cause list, but the Safety probability uses the union of harmed sessions.

User-authored PII, injection attempts, and unsafe prompts are exposure. They are shown but do not
enter the numerator.

# Signals

Each promoted signal is dynamic evidence with the roles and estimators defined in
[`signals.md`](signals.md). Signal observations resolve at session level so cluster count and
taxonomy cannot multiply the measured consequence.

# Measurements kept outside the score

The page may show these values, but they do not estimate one of the five dimension quantities.

## Raw levels

Total spend, cost per session, wall-clock duration, raw TTFT, raw context-window utilization, token
counts, and traffic volume remain context. Cost uses only the portions tied to a defined family
metric and Speed uses only its normalized necessary-time ratio.

## Project-history comparisons

Window-over-window drift, signal escalation, and regression state belong to monitors and trend
charts. They do not enter the current-window score.

## Ambiguous healthy levels

Zero-hit search share, general tool dominance, calls per offered tool, duplicate memory records, and
uncalibrated dispersion can be healthy for some agents. Only the unambiguous repeated or
counterfactual waste isolated by a metric enters the score.

## Generic span error counts

SDKs disagree about handled exceptions. Named provider errors and judged tool failures are used
instead.

## Human workflow state

Signal priority, assignment, resolution, muting, archiving, and feedback do not describe agent
behavior. Annotation volume is not itself a metric. Scores assigned to ignored signals are the
explicit exclusion defined in [`signals.md`](signals.md); independent telemetry readers remain
unchanged.

## Positive evidence beyond Task Success

Resolution and satisfaction moments can become Outcome estimator inputs in a later scoring version.
Their absence is not failure.

## Synthetic traffic

Sessions with a simulation id belong to experiments and evaluations, not the production score.
