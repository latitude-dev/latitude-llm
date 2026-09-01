# Session assessment

> Read [`README.md`](README.md) for the five dimensions. Supporting evidence is catalogued in
> [`metrics.md`](metrics.md), [`signals.md`](signals.md), and [`flaggers.md`](flaggers.md).

## Purpose

A project benchmark explains the agent across many sessions. A session assessment explains what
happened in one session.

One session does not have a dimension score. Reliability and Safety describe risk across repeated
traffic. Outcome can require calibrated evidence from comparable sessions. Cost and Speed compare
observed resources with a counterfactual. Compressing those different claims into five session
numbers would imply precision the evidence does not have.

The assessment tells the session's story instead. It gathers the available evidence, keeps its
position in the conversation or trace, identifies which dimensions it informs, and states whether
the evidence is positive, negative, or context.

## What the assessment answers

For one session, a user can answer:

- Did the agent produce a usable completion?
- What evidence suggests the task succeeded or failed?
- Which operational problems ended the session, and which ones it recovered from?
- How much spend and critical-path time was avoidable?
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
- session filters and exports;
- the benchmark's window-level estimators;
- cause attribution on the Agent Score page.

It is resolved from current source records when requested. Latitude does not persist a session
assessment or freeze a session-level score.

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

The role identifies the estimator channel. The occurrence says whether the effect is positive,
negative, or context and carries the structured result. For example, `operationalIncident` can be a
recovered provider error. Its Reliability effect is context, while the same event has negative Cost
and Speed effects.

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
  destination: SessionEvidenceDestination
}

type SessionDimensionEffect = ScoreEvidenceContract & {
  direction: "positive" | "negative" | "context"
  measurement: "observed" | "estimated" | "notMeasured"
  benchmarkUse: "direct" | "modeled" | "attributionOnly" | "contextOnly"
  impact?: SessionEvidenceImpact
  confidence?: SessionEvidenceConfidence
}
```

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
  | { kind: "duration"; observedNanoseconds: number; avoidableNanoseconds?: number }
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

## Dimension summaries

The assessment does not reduce a dimension to a single state. Each summary contains the evidence a
user can read without opening every row:

| Dimension | Session summary |
| --- | --- |
| Outcome | explicit positive and negative evidence, plus calibrated probability when available |
| Reliability | usable completion, terminal failure, and recovered incidents |
| Cost | observed spend, measured avoidable spend, and unmeasured Cost evidence |
| Speed | observed critical-path time, measured avoidable time, and unmeasured Speed evidence |
| Safety | confirmed harm, exposure, successful defense, and examination coverage |

Examples:

```text
Outcome       1 positive observation · 2 negative observations
Reliability   Completed · 1 recovered provider incident
Cost          $0.04 of $0.31 measured as avoidable
Speed         3.2s of 18.4s measured as avoidable
Safety        1 injection attempt refused · no confirmed harm observed
```

"No confirmed harm observed" is shown with examination coverage. It never means the session was
safe when no relevant detector ran.

## Evidence sources

### Metrics and telemetry

Every metric in [`metrics.md`](metrics.md) states its session evidence. Some provide an endpoint,
while others provide spend or time. Value evidence can also be positive:

- a usable final output is positive Reliability evidence;
- TTFT or throughput at or better than the frozen expectation is positive Speed evidence;
- achieved cache use at the session's measurable ceiling is positive Cost evidence;
- a provider or tool retry that completed is positive recovery evidence and negative resource
  evidence.

Readers do not generate a positive item merely because no defect was found.

### Task Success

The `task-success` flagger judges the complete session and produces `success`, `failure`,
`indeterminate`, or `notApplicable`. Success and failure become passed and failed system scores.
Indeterminate and not-applicable decisions remain coverage facts and do not become scores.

A failed Task Success score can enter normal signal discovery. A passed score never creates a
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

Conversation moments provide positive or negative Outcome evidence. Corrections, abandonment, and
frustration are negative. Explicit resolution or satisfaction can be positive once the Outcome model
has calibrated that evidence. A handoff is context unless earlier evidence shows failed self-service.

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
direction, source, and measured state are filters. Filtering does not duplicate multi-dimension
items.

The operation returns complete dimension summaries and cursor-paginates evidence items in this
order. Cursors use the stable chronology key and evidence key. The default page size is 100. The web
panel virtualizes additional pages rather than truncating large sessions.

## Coverage

Coverage is part of the session story. It reports:

- which deterministic readers had their required telemetry;
- which sampled flaggers were examined and why;
- known inclusion probabilities;
- missing pricing;
- whether the critical path could be reconstructed;
- conversation-analysis status;
- unmapped finish reasons or provider errors;
- signal effects that lack enough comparison traffic.

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

The input identifies a project and session. The use-case resolves the session's trace ids so callers
do not need to understand orphan score rows. Organization access is enforced at the boundary, and
every repository read remains organization and project scoped.

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
- Exact money and time are never replaced by a generic point value.
- A recovered incident is not a terminal failure.
- Exposure is not confirmed harm.
- Missing examination is not a clean result.
- Scores assigned to ignored signals are excluded; other signal lifecycle state does not change the
  assessment.
- The assessment is resolved dynamically and is never persisted as a session score.
- The web, public operation, and benchmark use the same evidence semantics.
