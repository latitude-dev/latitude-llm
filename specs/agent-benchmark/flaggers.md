# Flaggers

> Read [`metrics.md`](metrics.md), [`signals.md`](signals.md), and
> [`session-assessment.md`](session-assessment.md) first. This document defines the flagger
> observations and coverage data used by session assessment and the score.

A flagger is a detector, not a scoring unit. Its finding can establish an endpoint, supply a model
feature, identify resource waste, or confirm harm. Session assessment and the score need structured
findings and a record of which sessions each flagger could have examined.

## Required changes

| Change | Purpose |
| --- | --- |
| persist finding kind and conditional metadata | distinguish terminal failure, recovery, exposure, and harm |
| retain recovered findings without publishing discovery events automatically | measure retry cost and time without signal-volume inflation |
| compare tool output in repetition detection | separate polling from repeated work |
| guard empty grouping fields | prevent missing telemetry from manufacturing matches |
| pair truncation with output damage | distinguish configured length stops from broken output |
| separate injection attempt from compliance | keep exposure out of the Safety numerator |
| add the sampled `task-success` verdict path | give Outcome a direct holistic reference verdict and persist passed scores |
| store every screening decision and inclusion probability | provide denominators and selection correction |
| copy structured flagger fields to ClickHouse | keep scoring and attribution queries session-grained |

## Structured findings

The matched variant of `DetectionResult` carries structured fields in addition to feedback and
message position:

```ts
type DetectionResult =
  | { kind: "unmatched" }
  | {
      kind: "matched"
      feedback: string
      messageIndex?: number
      findingKind: string
      recovered?: boolean
      sameSubjectRecovered?: boolean
      terminal?: boolean
      exposure?: boolean
      confirmedHarm?: boolean
    }
```

The exact conditional schema can use discriminated variants per flagger. The invariant is that code
does not reconstruct score semantics from a feedback sentence.

For `tool-call-errors`, `findingKind` distinguishes failed response, malformed call, duplicate call
id, orphan response, and undeclared tool. The undeclared-tool kind remains diagnostic because missing
captured definitions are a common cause.

For `output-schema-validation`, the kind distinguishes incomplete or unclosed output from other
schema failures so finish-reason classification can apply the two-observation truncation rule.

## Task Success

`task-success` is a configurable LLM-as-judge flagger named **Task Success**. It asks whether the
agent successfully completed all material user goals that remained active at the end of the session.
It judges the session holistically rather than publishing task episodes.

```ts
type TaskSuccessVerdict =
  | { verdict: "success"; feedback: string; messageIndex?: number }
  | { verdict: "failure"; feedback: string; messageIndex?: number }
  | { verdict: "indeterminate"; reason: string }
  | { verdict: "notApplicable"; reason: string }
```

The flagger uses the normal project-configured sample rate, hints, rate limits, and screening
decision infrastructure. The selection probability is stored before classification.

The existing flagger workflow writes only matched negative annotations. Task Success extends it:

- `success` writes a published, passed system score with `value = 1`;
- `failure` writes a published, failed system score with `value = 0`, feedback, and anchors;
- only a failed score publishes the discovery event that can create or join a signal;
- `indeterminate` and `notApplicable` write no score and remain coverage decisions;
- a model or workflow error is unexamined, not a failed task.

Hard deterministic endpoints such as no output can establish failure even when the LLM path was not
selected. Specialized Outcome flaggers remain evidence about why the task failed; they do not
replace the holistic verdict.

## Recovery has two meanings

Tool and provider observations carry two recovery fields:

- `recovered` means the session made successful progress later and delivered a usable completion;
- `sameSubjectRecovered` means the same provider operation or tool later succeeded.

The first field controls terminal Reliability. The second supports attribution to the integration a
user should fix. A failed `search_docs` followed by a successful `grep_files` can be recovered at the
session level without proving that `search_docs` recovered.

Recovered findings remain available to Cost and Speed. They do not automatically publish the
`ScoreCreated` event used by signal discovery, clustering, naming, monitor evaluation, and
notifications. Signal discovery continues to receive terminal findings, structural defects, and
findings selected by its own evidence policy. Measurement persistence and signal publication are
separate decisions.

This separation also prevents re-screening a session from changing the identity of its primary
published finding. Measurement rows use a stable key that includes session, flagger slug, finding
kind, and occurrence position.

## Deterministic and sampled flaggers

Deterministic flaggers run on every readable session. Their structured observations can enter a
dimension directly. These include `tool-call-errors`, `output-schema-validation`, `empty-response`,
and the deterministic repeated-call portion of `trashing`.

LLM flaggers are sampled. Their findings can enter a calibrated estimator only when the screening
decision has a known inclusion probability. Stored positives without a measurable selection process
remain examples and signal-discovery evidence.

`trashing` has deterministic and LLM paths. The observation records which path matched rather than
inferring it from the presence of a trace id.

## Tool repetition compares results

`trashing` builds a signature for consecutive tool calls. The signature contains tool name, input
hash, and output hash. Three identical signatures in a row establish thrashing.

Tool name and input alone are insufficient. Polling repeats arguments because the caller expects the
result to change. Empty captured arguments or output are also insufficient because every missing
value would collide.

The deterministic reader therefore:

- skips calls with empty captured input or output;
- compares output as well as name and input;
- records every repeated occurrence needed to measure resource waste;
- publishes one stable loop finding for signal discovery.

`tools.repeated_call` uses the same signature without requiring consecutive calls. The session
counterfactual deduplicates the two metrics.

## Memory readers guard empty values

`memory.noop_rewrite` requires non-empty current and previous content hashes.
`memory.repeated_zero_hit` requires non-empty query text. `memory.reverted_write` requires non-empty
hashes for every compared version.

Rows that fail a guard lower reader coverage. They never count as a match.

## Truncation requires output damage

A finish reason of `length` or `max_tokens` can describe a complete response produced under an
intentional output limit. Truncation becomes `spans.finish_failure` only when the final output also
contains observable damage reported by `output-schema-validation`.

Content filters, guardrail interventions, and malformed function calls do not need a second finding.
They have no equivalent healthy configured cause.

The structured finding records whether the affected generation was final. A final broken generation
is terminal Outcome and Reliability evidence. An earlier broken generation that the session replaced
is measured as avoidable Cost and Speed where resource telemetry exists.

## Injection attempt and compliance

The `jailbreaking` classification returns separate fields for:

- an injection or instruction-hierarchy attack was attempted;
- the assistant complied with the attempt;
- the assistant action that constitutes compliance.

The same model call judges both sides of the conversation. Attempt is Safety exposure. Compliance is
confirmed harm when the assistant-side evidence is present. This structured LLM verdict is the
confirmation contract; a second model or human review is not required. A generic jailbreak match
never enters the Safety numerator.

PII findings follow the same authorship rule. User-authored PII is exposure. Assistant disclosure can
be confirmed harm.

## Screening decisions

Screening produces one logical decision per eligible flagger, session, and analysis generation:

```ts
type FlaggerScreeningDecision = {
  decisionId: string
  organizationId: string
  projectId: string
  sessionId: string
  flaggerSlug: string
  analysisHash: string
  attempt: number
  version: number
  selected: boolean
  reason:
    | "deterministic"
    | "hinted"
    | "uniform-sample"
    | "ordinary-sample"
    | "skipped"
    | "rate-limited"
  inclusionProbability?: number
  hintKinds: string[]
  outcome?: "matched" | "unmatched" | "success" | "failure" | "indeterminate" | "notApplicable" | "error"
  createdAt: Date
}
```

`decisionId` is deterministic for the organization, project, session, flagger, and analysis hash.
The initial append-only row is written before classifier execution. Terminal outcome rows reuse the
same id and selection fields with a higher version; queries collapse them with the latest version.
Execution retries increment `attempt` but reuse the generation's sampling draw and inclusion
probability.

The reason names the selection mechanism, not the classifier result. An ordinary sample that loses
its sampling draw has `selected: false` and `reason: "ordinary-sample"`; `skipped` is reserved for a
policy skip. The inclusion probability is the probability before observing the flagger result.
Deterministic and uniformly examined sessions use 1. Ordinary samples store their configured
probability. Rate-limited or policy-skipped sessions are not readable unless the probability model
explicitly accounts for them.

The append-only ClickHouse table is ordered by organization, project, session, flagger slug, analysis
hash, and decision id. It uses the standard retention TTL, which must exceed the longest score window
plus one daily run interval. The workflow writes decisions before executing sampled model calls so
failed execution remains measurable.

Window readers collapse revisions by decision id, then select the newest analysis generation for
each session and flagger as of the calculation cutoff. Findings and decisions from superseded
generations remain operational history but do not add to the examined denominator or estimator. If
the newest generation is pending or failed, that session is unexamined; readers never fall back to a
successful older generation.

For Task Success, hinted sessions form a deterministically selected stratum and unhinted sessions use
the configured probability. Safety chooses the session once and runs every launch Safety detector on
the selected session, so exposure and confirmed-harm unions share one examined population.

This table supports:

- inverse-probability correction for signal and flagger evidence;
- Task Success and Safety examined populations;
- per-flagger coverage and rate-limiter diagnostics;
- confidence intervals over the examined population;
- an honest distinction between no finding and no examination.

## ClickHouse score fields

Flagger-authored score rows copy the structured fields needed for window reads:

- `flagger_slug`;
- `finding_kind`;
- `recovered`;
- `same_subject_recovered`;
- `terminal`;
- `exposure`;
- `confirmed_harm`;
- Task Success verdict;
- flagger path, deterministic or sampled.

The Postgres score metadata remains the source for detailed feedback. ClickHouse receives the bounded
columns required for session-level estimation and attribution. Migrations are append-only and the
backfill preserves stable occurrence identities.

## Flagger controls

Flaggers remain switchable per project. Disabling a detector stops new observations and lowers
coverage. It cannot turn prior failures into successes or increase a dimension.

Muted and archived state affects discovery and triage. The scoring job reads stored observations and
screening coverage, not current workflow state.

Ignored signals are the exception defined in [`signals.md`](signals.md#which-signals-enter-estimation):
scores assigned to an ignored signal are excluded by the shared eligibility predicate.

Telemetry readers remain independent where practical. Provider errors and finish reasons come from
spans so disabling an overlapping flagger cannot hide operational failure.

## User-facing coverage

The Flaggers settings page shows, per flagger and selected window:

- eligible sessions;
- deterministic, hinted, uniformly sampled, ordinarily sampled, skipped, and rate-limited counts;
- readable share;
- positive findings split by kind;
- whether the finding can enter a calibrated score;
- unknown selection probability or missing telemetry warnings.

The session and signal pages name the finding kind rather than displaying a raw feedback paragraph as
the primary label.
