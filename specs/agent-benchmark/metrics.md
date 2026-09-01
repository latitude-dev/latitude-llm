# Metrics

> Read [`score.md`](score.md) for the dimension estimands and
> [`session-assessment.md`](session-assessment.md) for how observations tell one session's story.
> This catalogue defines the observations used by both.

A metric does not return a generic loss and has no point budget. It returns evidence in a native
form: an endpoint, probability feature, amount of spend, duration on the critical path, or confirmed
safety failure.

## Metric contract

Every metric definition specifies:

| Field | Meaning |
| --- | --- |
| ID | stable identifier used in evidence, filters, and cause rows |
| dimensions | estimands the observation can inform |
| evidence role | endpoint, outcome feature, resource evidence, or confirmed harm |
| reader | telemetry and grouping used to produce the observation |
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

### Complete resource bases

Session assessment can show an exact observation from partially captured telemetry. A project-level
Cost or Speed ratio is stricter:

- Cost uses a session only when every spend-bearing component is priced or explicitly zero-priced.
- Speed uses a session only when its critical path is reconstructable and every latency-bearing
  segment required by the counterfactual is classified or has a frozen reference.

An incomplete session is excluded from that dimension's numerator and denominator. Its exact waste
remains visible as evidence. The page reports the excluded workload and the resulting coverage so
complete-case selection is not hidden.

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
- Reader: the `empty-response` flagger on the last assistant turn.

A turn containing a tool call or reasoning is production. Blank text, whitespace-only text, and one
character repeated are empty. The session probability of Outcome success is anchored at zero. The
session also fails Reliability because no usable completion was delivered.

The flagger returns no match when no assistant message was captured. That case is unreadable rather
than failed.

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

Truncation requires two observations: an unreliable length-related finish reason and malformed or
incomplete output from `output-schema-validation`. A deliberately short output limit can end with
`length` while still returning a complete value. Content filters, guardrail interventions, and
malformed calls require no second observation.

An unreliable final generation anchors Outcome at zero and creates a Reliability failure. The same
condition on an earlier generation contributes the wasted generation's critical-path duration to
Speed if the session recovered. Position is metadata on one metric, not a second metric or severity.

Unmapped values lower coverage. A periodic fleet report keeps the classifier current.

## `spans.provider_error`

- Dimensions: Reliability, Cost, Speed.
- Evidence role: terminal endpoint when unrecovered; resource evidence when recovered.
- Reader: a named provider-error classifier over `error_type` on chat spans.

Rate limiting, overload, service failure, and provider rejection qualify. Generic span error status
does not, because SDKs disagree about whether handled exceptions set it.

The reader pairs the error with later successful progress:

- no later successful generation or usable completion: terminal Reliability failure;
- later success: retry spend and retry critical-path duration for Cost and Speed.

The finding carries `recovered`, the failed span index, the successful span index when present, cost,
and critical-path duration. Recovery is factual metadata, not a score band.

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
- Evidence role: terminal endpoint when unrecovered; resource evidence when recovered.
- Reader: error findings from `tool-call-errors`.

The flagger pairs tool calls with responses and excludes HTTP statuses the caller declared expected.
A later successful call or other successful progress can recover the session even when it used a
different tool. Reliability asks whether the agent completed, not whether one integration was flaky.

Recovered failures remain observable so their actual spend and critical-path duration can enter Cost
and Speed. They do not open signal-discovery work automatically. [`flaggers.md`](flaggers.md) defines
that separation.

Attribution also records same-tool recovery. The session-wide marker answers whether the run
completed; the tool-specific marker tells the user which integration needs work.

## `tools.structural_defect`

- Dimensions: Reliability, Cost, Speed.
- Evidence role: terminal endpoint only when completion failed; otherwise resource evidence.
- Reader: malformed, duplicate-id, and unknown-id findings from `tool-call-errors`.

A call with a missing id or name, duplicate call id, or response referencing no known call qualifies.
A tool absent from captured definitions does not. Missing definitions usually indicate incomplete
instrumentation.

The unknown-id case is readable only when at least one tool call survived in the window. Input
truncation can otherwise leave an orphan response after removing the original call.

If the session recovered, Cost and Speed receive only the measured correction work. If the defect
prevented a usable completion, Reliability fails.

## `tools.repeated_call`

- Dimensions: Cost, Speed.
- Evidence role: exact redundant resource use.
- Reader: repeated tool name, input hash, and output hash within one session.

The same arguments must produce the same result. Polling with changing output is necessary work.
Calls with empty captured input or output are unreadable.

The first call belongs to the necessary counterfactual. Later identical calls contribute their
attributable spend and critical-path duration. `tools.thrashing` can describe the same repetitions;
the session counterfactual deduplicates them.

## `tools.thrashing`

- Dimensions: Cost, Speed.
- Evidence role: exact redundant resource use and a named loop cause.
- Reader: three or more consecutive identical tool names, inputs, and outputs.

This is the deterministic half of the `trashing` flagger. Tool dominance without identical results
is only a screening hint for the LLM flagger and does not establish waste.

Thrashing names the loop for attribution. It does not add resource use on top of repeated-call spans
already classified as avoidable.

## `tools.dead_surface`

- Dimension: Cost.
- Evidence role: value-based avoidable input spend.
- Reader: tool definitions and calls over the definition's observation period.

A definition qualifies when it has been sent since first observation and has never been called. Its
avoidable spend is the priced input-token cost of serializing that definition on each model request:

```text
avoidableSpend = sum(definitionInputTokens * requestInputTokenPrice)
```

Definitions merely unused in the current score window do not qualify. The observation period avoids
penalizing a legitimate tool that was not needed this week.

A called name with no matching definition reports a coverage warning because MCP namespace
differences can make a used tool look dead.

# Memory

Memory metrics apply only to captured memory activity. Each identifies exact repeated work.

## `memory.repeated_zero_hit`

- Dimensions: Cost, Speed.
- Evidence role: redundant resource use.
- Reader: the same non-empty query repeated in one session with zero results every time.

The first search is necessary. Later searches contribute captured processing spend and critical-path
duration. A single zero-hit search is healthy and does not score.

## `memory.noop_rewrite`

- Dimension: Cost.
- Evidence role: redundant resource use.
- Reader: a write whose non-empty content hash matches the record's prior hash.

The write's attributable processing cost is avoidable. Empty hashes are unreadable.

## `memory.reverted_write`

- Dimension: Cost.
- Evidence role: redundant resource use.
- Reader: a write restored to the record's prior non-empty content hash within the same session.

The intermediate write and the work directly required to undo it are candidate avoidable spend. The
session-level counterfactual prevents overlap with a no-op or repeated-call cause.

# Cost

## `cost.cache_gap`

- Dimension: Cost.
- Evidence role: value-based avoidable spend.
- Reader: measured cache use and achievable cache use for the project's own request cadence.

The achievable ceiling accounts for each model's documented cache lifetime and for how much
cache-eligible input arrived soon enough behind a matching request. Traffic with no possible cache
reuse has no gap.

```text
avoidableCachedTokens = max(0, achievableCachedTokens - measuredCachedTokens)
avoidableSpend = avoidableCachedTokens * applicableTokenSaving
```

The reader reports the share of priced tokens for which a ceiling could be computed. Missing models
do not count as either fully cached or fully wasted.

# Moments

Conversation intelligence produces probabilistic Outcome evidence. It does not assign a fixed score
deduction.

## `moments.strong_failure`

- Dimension: Outcome.
- Evidence role: strong negative task-success feature.
- Reader: correction, repeated-information request, abandonment, or explicit frustration.

These moments quote the user's next turn as evidence. The Outcome model learns their conditional
failure probability from sampled Task Success verdicts. Multiple strong moments on one session
remain one feature set rather than repeated deductions.

## `moments.failed_self_service`

- Dimension: Outcome.
- Evidence role: paired negative task-success feature.
- Reader: escalation to a human after a correction or frustration, ordered by message index.

An intended handoff is not failure. The earlier negative moment establishes that self-service failed
before the handoff.

## `moments.weak_failure`

- Dimensions: Outcome, Speed.
- Evidence role: probabilistic task-success feature and residual time attribution.
- Reader: stalled or hesitant behavior.

For Outcome, the calibrated model determines how much this changes task-success probability. For
Speed, it can attribute excess critical-path time left unexplained after deterministic latency and
retry readers. It never invents a fixed duration.

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

Total spend, cost per session, wall-clock duration, raw TTFT, token counts, and traffic volume remain
context. Cost and Speed use them only inside normalized necessary-resource ratios.

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

## Positive evidence without Task Success calibration

Resolution and satisfaction moments may be Outcome features once sampled Task Success verdicts show
how they relate to success. Their absence is not failure.

## Synthetic traffic

Sessions with a simulation id belong to experiments and evaluations, not the production score.
