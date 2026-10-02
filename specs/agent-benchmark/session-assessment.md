# Session assessment

> Read [`README.md`](README.md) for the five dimensions. Supporting evidence is catalogued in
> [`metrics.md`](metrics.md), [`signals.md`](signals.md), and [`flaggers.md`](flaggers.md).

## Purpose

A project benchmark explains the agent across many sessions. A session assessment explains what
happened in one session.

One session does not have a dimension score. Reliability and Safety describe risk across repeated
traffic. Outcome uses project-level examined task-outcome judgments. Cost combines family
rates across a selected population, and Speed compares observed critical-path time with a
counterfactual. Compressing those different claims into five session numbers would imply precision
the evidence does not have.

The assessment tells the session's story instead. It gathers the available evidence, keeps its
position in the conversation or trace, identifies which dimensions it informs, and states whether
the evidence is positive, negative, or context.

## What the assessment answers

For one session, a user can answer:

- Did the agent produce a usable completion?
- What evidence suggests the task succeeded or failed?
- Which operational problems ended the session, and which ones it recovered from?
- Which Cost metrics produced adverse or efficient raw readings, and what native resource effect was
  observed or estimated?
- How much spend and critical-path time was avoidable where that quantity can be estimated?
- Did the agent cause safety harm, encounter hostile input, or defend against it?
- Which recurring signals appeared?
- Which parts of the session were not examined or could not be measured?
- Where in the conversation, spans, tool calls, or signal details can the evidence be inspected?

The assessment includes good and bad evidence. Absence of a finding is not positive evidence. A
positive item requires an observed successful result, explicit positive user evidence, measured
efficiency, or a successful defense against an exposure.

## Relationship to existing scores and signals

The session Scores tab currently lists annotations, evaluations, and custom scores. The assessment
does not replace those records. It interprets the subset that has benchmark meaning and combines it
with telemetry that is not stored as a score, including finish reasons, provider retries, tool and
memory waste, critical-path time, and cache opportunity.

The session Signals tab remains the detailed signal workflow. It owns lifecycle, occurrence history,
and navigation into signal details. The assessment attaches signal references to the session story
and links to that workflow.

The assessment is the shared read model used by:

- the session Scores panel;
- public session-assessment operations;
- the benchmark's window-level estimators;
- cause attribution on the Agent Score page.

It is resolved from current source records when requested. Latitude does not persist a session
assessment or freeze a session-level score.

## Persistence boundary

An assessment observation is a normalized fact, not necessarily a database row. Deterministic
observations are calculated from retained session telemetry whenever the single-session or bulk
resolver runs. Empty output, malformed output, tool failures, recovery, finish reasons, provider
errors, repetition, and other telemetry-derived facts do not become additional score rows.

Scores remain the persisted records for human annotations, evaluations, and flagger or judge results
that cannot be reproduced exactly. A flagger-authored score may carry a stable `findingKey` that
links it to the deterministic source fact which caused signal discovery, but it does not duplicate
the complete finding. Model-produced structured verdicts and their scoring-artifact provenance are
persisted because rerunning a model later is not guaranteed to return the same result.

Screening decisions are persisted separately. Scores alone cannot distinguish a classifier that ran
and found nothing from one that was skipped, sampled out, rate-limited, or failed. Together, retained
telemetry, persisted scores, signals, moments, and screening decisions are sufficient to resolve the
assessment. No separate persisted observation entity is introduced.

## Shared vocabulary

`ScoreDimension` and `ScoreEvidenceContract` live in `@domain/shared` because Signals, Flaggers,
span readers, session assessment, public operations, and the benchmark all use them. The contract is
a discriminated union, so an evidence role cannot be paired with the wrong dimension.

```ts
type ScoreDimension = "outcome" | "reliability" | "cost" | "speed" | "safety"

type ScoreEvidenceContract =
  | { scoreDimension: "outcome"; role: "taskOutcome" }
  | {
      scoreDimension: "reliability"
      role: "completionOutcome" | "operationalIncident"
    }
  | { scoreDimension: "cost"; role: "spendEfficiency" }
  | { scoreDimension: "speed"; role: "criticalPathEfficiency" }
  | {
      scoreDimension: "safety"
      role: "confirmedHarm" | "exposure" | "successfulDefense"
    }
```

The role identifies the estimator channel. `spendEfficiency` remains the persisted compatibility
name for the general Cost channel introduced in PR 1; PR 3 resolves its Cost family from the linked
metric or residual signal policy instead of migrating existing signal JSON. The occurrence says
whether the effect is positive, negative, or context and carries the structured result. For example,
`operationalIncident` can be a recovered provider error. Its Reliability effect is context, while
the same recovered event can have negative Cost and Speed effects.

## Assessment model

```ts
type SessionAssessment = {
  sessionId: string
  items: SessionAssessmentItem[]
  nextCursor?: string
  dimensions: SessionDimensionSummary[]
  coverage: SessionAssessmentCoverage
}

type SessionAssessmentItem = {
  id: string
  evidenceKey: string
  label: string
  description?: string
  source: "metric" | "signal" | "flagger" | "score" | "moment"
  metricId?: string
  signalIds: string[]
  scoreIds: string[]
  occurrenceCount: number
  effects: SessionDimensionEffect[]
  anchors: SessionEvidenceAnchor[]
  destinations: SessionEvidenceDestination[]
}

type SessionDimensionEffect = ScoreEvidenceContract & {
  direction: "positive" | "negative" | "context"
  measurement: "observed" | "estimated" | "notMeasured"
  benchmarkUse: "direct" | "modeled" | "attributionOnly" | "contextOnly"
  impact?: SessionEvidenceImpact
  costEvaluation?: SessionCostMetricEvaluation
}

type SessionCostMetricEvaluation = {
  family: "spend" | "context" | "tools" | "memory" | "recovery"
  rawValue?: number
  rawUnit?: string
  measurementState: "measured" | "unmeasured" | "notApplicable"
  nativeImpact?: EstimateRange
}

type SessionCostMetricEvidence = {
  metricId: string
  family: "spend" | "context" | "tools" | "memory" | "recovery"
  aggregation: "resourceRatio" | "eventRate" | "sessionMean"
  measurementState: "measured" | "unmeasured" | "notApplicable"
  rawUnit: string
  rawValue?: number
  eligibleUnits?: number
  adverseUnits?: number
  evidence?: "confirmed" | "modeled"
  nativeImpact?: EstimateRange
  limitations: string[]
}

type EstimateRange = {
  unit: string
  point: number
  lower?: number
  upper?: number
  interpretation?: "identificationBound" | "confidenceInterval"
}
```

Anchors identify where the fact occurred. Destinations identify the authorized product records a
user can open. They are separate because one deduplicated item can point to both the underlying tool
call and a signal created from its discovery score.

```ts
type SessionEvidenceAnchor =
  | {
      kind: "message"
      traceId: string
      messageIndex: number
      partIndex?: number
      contentHash?: string
    }
  | { kind: "span"; traceId: string; spanId: string }
  | {
      kind: "toolCall"
      traceId: string
      toolCallId: string
      toolName?: string
      messageIndex?: number
    }
  | { kind: "memoryEvent"; memoryEventId: string }
  | { kind: "score"; scoreId: string }
  | { kind: "signal"; signalId: string }

type SessionEvidenceDestination =
  | { kind: "sessionMessage"; traceId: string; messageIndex: number; partIndex?: number }
  | { kind: "span"; traceId: string; spanId: string }
  | { kind: "toolCall"; traceId: string; toolCallId: string }
  | { kind: "memoryEvent"; memoryEventId: string }
  | { kind: "score"; scoreId: string }
  | { kind: "signal"; signalId: string }
```

Both lists are deduplicated. An item may have no destination when its source has no existing product
detail surface; the API returns an empty list rather than a placeholder route. Destinations contain
identifiers, not web URLs, so web, SDK, CLI, and in-process consumers can resolve them appropriately.
The current memory ledger has no standalone event id. `memoryEventId` is therefore an opaque stable
key derived from organization, project, trace, span, store, record, change kind, and timestamp. It is
not a new persisted identifier and does not require a migration.

`SessionEvidenceImpact` is this discriminated union:

```ts
type SessionEvidenceImpact =
  | { kind: "taskOutcome"; verdict: "success" | "failure"; probability?: number }
  | { kind: "completion"; status: "usable" | "terminalFailure" }
  | {
      kind: "incident"
      status: "recovered" | "unrecovered"
      sameSubjectRecovered?: boolean
    }
  | { kind: "spend"; observedMicrocents: number; avoidableMicrocents?: number }
  | { kind: "duration"; observedNs: number; avoidableNs?: number }
  | { kind: "outcomeAssociation"; probabilityChange?: number }
  | {
      kind: "safety"
      status: "exposure" | "successfulDefense" | "confirmedHarm"
      findingKind: string
    }
  | { kind: "observation"; value?: number; unit?: string }
```

An effect with `measurement: "notMeasured"` still appears when the evidence is real but its
consequence cannot yet be quantified. A newly promoted Cost signal is one example.

`benchmarkUse` prevents visibility from implying arithmetic. Direct facts enter an estimand,
modeled facts enter a calibrated or counterfactual estimator, attribution-only facts explain an
already established deficit, and context-only facts never change the score.

Cost and Speed attach uncertainty to the concrete native estimate, not to whether the source fact
occurred. Session-level estimates generally use same-unit identification bounds. Project-level
dimension and composite intervals remain owned by the score contract and use confidence intervals.
Lower and upper session scenarios rerun deduplication and aggregation; item ranges are never added
naively.

## Dimension summaries

The assessment does not reduce a dimension to a score. It returns all five summaries, including
dimensions with no readable evidence. Direction counts and measurement counts are orthogonal: one
recovered tool incident can be observed Reliability context and simultaneously unmeasured negative
Cost evidence. Counts are over deduplicated effects in that dimension, not raw source rows or items.

```ts
type SessionDimensionSummaryBase = {
  scoreDimension: ScoreDimension
  evidenceCounts: {
    positive: number
    negative: number
    context: number
  }
  measurementCounts: {
    observed: number
    estimated: number
    notMeasured: number
  }
  coverage: "complete" | "partial" | "notExamined"
}

type SessionDimensionSummary =
  | SessionDimensionSummaryBase & {
      scoreDimension: "outcome"
      taskOutcome?: {
        verdict?: "success" | "failure"
        probability?: number
      }
    }
  | SessionDimensionSummaryBase & {
      scoreDimension: "reliability"
      completion: "usable" | "terminalFailure" | "undetermined"
      recoveredIncidentCount: number
      unrecoveredIncidentCount: number
    }
  | SessionDimensionSummaryBase & {
      scoreDimension: "cost"
      observedMicrocents?: number
      measuredAvoidableMicrocents?: number
      estimatedAvoidableMicrocents?: number
      families: Array<{
        family: "spend" | "context" | "tools" | "memory" | "recovery"
        measurementState: "measured" | "partial" | "unmeasured" | "notApplicable"
        observedItemCount: number
        metrics: SessionCostMetricEvidence[]
        nativeImpact?: EstimateRange
      }>
    }
  | SessionDimensionSummaryBase & {
      scoreDimension: "speed"
      observedCriticalPathNs?: number
      measuredAvoidableNs?: number
      estimatedAvoidableNs?: number
    }
  | SessionDimensionSummaryBase & {
      scoreDimension: "safety"
      exposureCount: number
      successfulDefenseCount: number
      confirmedHarmCount: number
    }
```

Optional native values distinguish zero from unknown. A present zero is a measured zero; an omitted
value is unavailable. PR 2 can leave future Cost, Speed, Outcome, and Safety fields absent or zero as
appropriate until their owning PR supplies the reader. It does not invent placeholder estimates.

Examples:

```text
Outcome       1 positive observation · 2 negative observations
Reliability   Completed · 1 recovered provider incident
Cost          Repeated tool calls: 2 of 7 · Recoverable spend: $0.04 of $0.31
Speed         3.2s of 18.4s measured as avoidable
Safety        1 injection attempt refused · no confirmed harm observed
```

"No confirmed harm observed" is shown with examination coverage. It never means the session was
safe when no relevant detector ran.

## Usable completion

The operational content test is deliberately narrow:

```text
hasOutputContent = nonWhitespaceResponseText OR atLeastOneToolCall
```

Reasoning without response text or a tool call is not a delivered result. A captured assistant turn
with neither response text nor a tool call is terminal no-output evidence. No captured assistant turn
is unreadable and produces `completion: "undetermined"`, not a failure.

A tool call prevents a no-output finding even if it is malformed. Its malformed structure can still
produce a separate terminal operational finding. Likewise, non-empty repeated-character text counts
as content and becomes terminal only when schema, requested-output, or semantic usability evidence
confirms that it could not satisfy the task.

## Evidence sources

### Metrics and telemetry

Every metric in [`metrics.md`](metrics.md) states its session evidence. Some provide an endpoint,
while others provide spend or time. Value evidence can also be positive:

- a usable final output is positive Reliability evidence;
- TTFT or throughput at or better than the frozen expectation is positive Speed evidence;
- cache use at the session's measurable ceiling can be positive Cost evidence when the reader is
  applicable, readable, and has complete visibility;
- a provider or tool retry that completed is positive recovery evidence and negative resource
  evidence.

Readers do not generate a positive item merely because no defect was found.

### Task failure

The `task-failure` flagger judges the complete session and produces `success`, `failure`,
`indeterminate`, or `notApplicable`. Success and failure become passed and failed system scores.
Indeterminate and not-applicable decisions remain coverage facts and do not become scores.

A failed task-outcome score can enter normal signal discovery. A passed score never creates a
signal. The assessment shows the verdict and its anchors when the flagger examined the session.

### Signals

A signal occurrence contributes the roles stored in the signal's `scoreEvidence` list. One signal
can inform several dimensions. The session item appears once and carries one effect per applicable
dimension.

The occurrence itself is observed. Its Outcome, Cost, or Speed consequence may be estimated from
project traffic. When no credible effect estimate exists, the item remains visible with
`measurement: "notMeasured"`.

Scores assigned to ignored signals are excluded from benchmark evidence and do not produce signal
items in the assessment. Independent telemetry observations of the same underlying event remain
eligible.

### Annotations and evaluations

A score attached to a signal inherits that signal's evidence roles. A standalone annotation is
shown as human evidence but remains diagnostic until it carries an explicit dimension contract.
Evaluation scores inherit roles from their parent signal when one exists. Custom scores remain in
the raw score feed unless their public contract gains benchmark semantics.

### Moments

Conversation moments provide Outcome context. Corrections, abandonment, and frustration can appear
under needs attention. Explicit resolution or satisfaction remains contextual until a later scoring
version defines how it enters the project estimator. A handoff is context unless earlier evidence
shows failed self-service.

### Safety

User-authored PII, unsafe content, and injection attempts are exposure. Assistant disclosure or
compliance is confirmed harm. A refusal that successfully resists an injection is a positive defense
item. Attempt, response, and confirmation remain one assessment item with several effects where
possible.

## Deduplication

The assessment describes underlying events rather than detector output volume.

- A metric and signal derived from the same score row form one item with both references.
- Repeated identical tool calls form one item with an occurrence count and total resource impact.
- One provider retry can carry Reliability context plus Cost and Speed effects without appearing
  three times.
- Several signals describing the same underlying finding remain linked but do not duplicate the
  observed spend, time, terminal result, or harm.
- Human and automatic evidence remain separate when they are independent observations.

`evidenceKey` is stable across re-screening and daily recomputation. It is based on the source fact,
not its mutable label or signal lifecycle.

| Source | Evidence identity |
| --- | --- |
| span or provider finding | span id plus finding kind |
| tool finding | tool-call id plus finding kind |
| memory finding | memory event id plus finding kind |
| score or flagger verdict | score id |
| conversation moment | moment id |
| signal occurrence | the underlying score or finding identity, not the signal id alone |

## Ordering and anchors

The default list follows the session chronology. This is what makes the panel tell a story: an error,
a retry, a repeated call, a correction, and the final result appear in their observed order.

Every item can include one or more anchors:

- message and part position;
- trace and span id;
- tool call id and tool name;
- memory event id;
- signal id;
- score id.

Items without a temporal position sort after the timeline under "Session-wide evidence." Dimension,
direction, source, and measured state remain properties of each item and effect; PR 2 does not add
assessment filters.

The operation returns complete dimension summaries and cursor-paginates all evidence items in
chronological order. Cursors use the stable chronology key and evidence key. The default page size is
100. The web panel virtualizes additional pages rather than truncating large sessions.

## Coverage

Coverage is reported per reader because one session can have complete Reliability evidence and no
Safety examination. There is no single assessment-wide complete flag.

```ts
type SessionAssessmentCoverage = {
  readers: SessionReaderCoverage[]
}

type SessionReaderCoverageBase = {
  readerId: string
  label: string
  scoreDimensions: ScoreDimension[]
}

type SessionReaderSelection = {
  method: "deterministic" | "hinted" | "uniform-sample" | "ordinary-sample"
  inclusionProbability: number
}

type SessionCoverageLimitation =
  | "skipped"
  | "notSelected"
  | "rateLimited"
  | "executionFailed"
  | "pending"
  | "missingTelemetry"
  | "missingContent"
  | "truncatedContent"
  | "unmappedTelemetry"
  | "missingPricing"
  | "unknownModelContext"
  | "criticalPathUnavailable"

type SessionReaderCoverage =
  | SessionReaderCoverageBase & {
      status: "examined"
      findingCount: number
      selection?: SessionReaderSelection
    }
  | SessionReaderCoverageBase & {
      status: "partiallyExamined"
      findingCount: number
      readableCount: number
      totalCount: number
      limitation: SessionCoverageLimitation
      selection?: SessionReaderSelection
    }
  | SessionReaderCoverageBase & {
      status: "notExamined"
      limitation: SessionCoverageLimitation
      selection?: SessionReaderSelection
    }
  | SessionReaderCoverageBase & {
      status: "notApplicable"
    }
```

`examined` with `findingCount: 0` means the reader ran and found nothing. `notExamined` means no such
claim is possible. Disabled, suppressed, unavailable-flagger, and missing-flagger-context policy
paths all expose the single public limitation `skipped`; PR 2 does not expose skip subreasons.
Statistically distinct states such as a known sampling loss, rate limiting, execution failure, or
missing telemetry remain separate because later estimators handle them differently.

Coverage includes deterministic telemetry readability, sampled examination and inclusion
probability, pricing availability, critical-path reconstruction, conversation-analysis status,
unmapped span values, captured content, truncated content, known model context limits, and signal
effects without adequate comparison traffic.

The UI distinguishes "examined with no finding" from "not examined." The assessment never fills
missing evidence with a positive item.

## Scores panel

The existing `scores` tab id and Scores label remain stable. The panel contains three sections:

1. **Session assessment**: dimension summaries, coverage, and the chronological evidence list.
2. **Annotations and evaluations**: the existing editable and read-only score cards.
3. **Raw evidence**: optional technical details for custom scores and observations that have no
   benchmark semantics.

The first section is useful even when no annotation or evaluation exists. Signal rows link to the
signal detail. Message and span rows open the existing conversation or span location with real links
where navigation leaves the current route.

The session Signals tab remains available for users who want the signal-specific table and lifecycle
workflow.

## Public operation

`@repo/operations` exposes a project-scoped session-assessment operation. The operation returns the
same domain read model used by the web panel. Its schema includes descriptions suitable for HTTP,
OpenAPI, MCP, SDKs, CLI, and in-process agent tools.

The input identifies a project and session and optionally carries the pagination cursor. It has no
assessment-filter parameters. The use-case resolves the session's trace ids so callers do not need
to understand orphan score rows. Organization access is enforced at the boundary, and every
repository read remains organization and project scoped.

The operation returns labels, structured effects, and anchors. It does not copy message, tool, or
span contents into the assessment payload. Callers follow the existing authorized destinations to
read raw content.

## Ownership and reuse

Source domains own normalized facts. `@domain/agent-score` owns the pure assessment resolver and the
read model because it owns the meaning of dimensions across sources. Platform repositories supply
single-session and bulk evidence. The single-session operation and the benchmark job share resolver
logic, but they do not share an N-plus-one query path.

The web app composes the use-case through server functions and collections. It contains no evidence
classification or score policy.

## Future task episodes

Outcome initially judges the session holistically: all material user goals that remain active at the
end must be resolved for the session to succeed. Existing flaggers may extract task episodes as
internal evidence, but episodes are not first-class Outcome units.

A later version may expose task and goal episodes, their individual verdicts, and within-session
progress. That addition requires a new Outcome contract and scoring-version boundary.

## Invariants

- A session has no 0 through 100 dimension score.
- One underlying event is one item, even when it informs several dimensions.
- Positive evidence is observed or calibrated; absence of negative evidence is not positive.
- Session evidence preserves native money, token, operation, incident, and time values; it never
  replaces them with a session-level generic point value.
- A recovered incident is not a terminal failure.
- Exposure is not confirmed harm.
- Missing examination is not a clean result.
- Scores assigned to ignored signals are excluded; other signal lifecycle state does not change the
  assessment.
- Deterministic observations are recalculated from retained telemetry rather than persisted as score
  rows or assessment rows.
- Scores persist authored or non-reproducible judgments; screening decisions persist whether sampled
  examination occurred.
- Response text or a tool call is required for a usable delivered result; reasoning alone is not a
  completion.
- The assessment has no assessment filters. Estimate ranges describe native quantities, not generic
  evidence confidence.
- The assessment is resolved dynamically and is never persisted as a session score.
- The web, public operation, and benchmark use the same evidence semantics.
