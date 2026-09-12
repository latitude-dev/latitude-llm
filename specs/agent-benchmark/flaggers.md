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
| return structured deterministic findings from telemetry readers | distinguish terminal failure, recovery, exposure, and harm without turning every fact into a score |
| link a discovery score to its source finding | merge the score and signal back into one assessment item without duplicating finding data |
| persist non-reproducible model verdicts and their provenance | preserve the exact result that was produced without rerunning a judge on page load |
| retain recovered findings in the dynamic read model without publishing discovery events automatically | measure recovery burden and marginal retry resources without signal-volume inflation |
| record tool name, input hash, output hash, and avoidability proof separately | distinguish observed repetition from confirmed waste; the current deterministic reader compares only name and argument preview |
| replace the blanket HTTP 400 through 499 exception with a caller-declared expected-status contract | avoid treating ordinary client errors as successful tool responses |
| guard empty grouping fields | prevent missing telemetry from manufacturing matches |
| require usability evidence for repeated-character output | avoid classifying valid compact answers as terminal failures |
| pair truncation with output damage | distinguish configured length stops from broken output |
| separate injection attempt from compliance | keep exposure out of the Safety numerator |
| add the sampled `task-failure` verdict path | give Outcome a direct holistic reference verdict and persist passed scores |
| store every screening decision and inclusion probability | provide denominators and selection correction |
| copy bounded score-native provenance to ClickHouse | keep persisted classifier and signal queries session-grained |

## Structured findings

Source domains expose structured findings independently from score persistence. A deterministic
reader returns every finding it can derive from the retained conversation, tool, span, or memory
telemetry:

| Current reader | Source helper result | Current strategy reduction |
| --- | --- | --- |
| `empty-response` | one generic match | writes that match as the discovery score |
| `output-schema-validation` | every damaged assistant output, with generation position | writes the first match as the discovery score |
| `tool-call-errors` | `collectToolCallErrorFindings` already returns every defect | selects the first structural or unrecovered defect for discovery |
| deterministic `trashing` | longest qualifying identical-call run | writes that loop as the discovery score |
| `low-cache-hit-rate` | one session-wide generic match | writes that match as the discovery score |

The shared contract makes the complete reader result available without changing that discovery
policy. Readers that currently produce one result return a zero-or-one-element list. Tool-call and
output-schema readers keep their complete lists.

```ts
type FlaggerFinding = {
  findingKey: string
  flaggerSlug: string
  findingKind: string
  feedback: string
  messageIndex?: number
  partIndex?: number
  responseMessageIndex?: number
  responsePartIndex?: number
  toolName?: string
  toolCallId?: string
  occurrenceCount?: number
  recovered?: boolean
  sameSubjectRecovered?: boolean
  terminal?: boolean
  generationPosition?: "final" | "intermediate"
  redundancy?: "confirmed" | "unconfirmed"
  exposure?: boolean
  confirmedHarm?: boolean
}

type DeterministicFindingRead =
  | { readable: true; findings: FlaggerFinding[] }
  | { readable: false; findings: [] }
```

The exact conditional schema can use discriminated variants per flagger. The invariant is that code
does not reconstruct score semantics from a feedback sentence.

`findingKey` is an opaque fixed-length hash of organization, project, session, reader id, immutable
source anchor, and finding kind. The source anchor is a tool-call id, span id, or message content hash
plus part position as appropriate. Artifact version, feedback, recovery, and signal assignment are
not part of the key, so the same source fact keeps its identity when it is recalculated or enriched.

The interactive assessment and benchmark bulk path call the same pure readers. They do not persist
the returned list as score rows or as a second observation table. A deterministic flagger can select
one discovery-worthy finding from the list and write the existing system annotation score. That
score may carry `flaggerFindingKey` so assessment can attach its score and signal references to the
calculated finding.

Persisted model-produced flagger scores carry `scoringArtifactVersion` and their structured verdict.
The version identifies the prompt, supported judge configuration, and result schema that produced
the evidence. A deterministic reader implementation is instead pinned by the scoring version that
invokes it. Evidence provenance remains separate from the later daily snapshot version.

For `tool-call-errors`, `findingKind` distinguishes failed response, malformed call, duplicate call
id, orphan response, and undeclared tool. The undeclared-tool kind remains diagnostic because missing
captured definitions are a common cause.

For `output-schema-validation`, the kind distinguishes incomplete or unclosed output from other
schema failures so finish-reason classification can apply the two-observation truncation rule.

## Task failure

`task-failure` is a configurable LLM-as-judge flagger named **Task failure**. It is named for what
it flags, like every other detector; the verdict it answers with is still two-sided. It asks whether the
agent successfully completed all material user goals that remained active at the end of the session.
It judges the session holistically rather than publishing task episodes.

```ts
type TaskOutcomeVerdict =
  | { verdict: "success"; feedback: string; messageIndex?: number }
  | { verdict: "failure"; feedback: string; messageIndex?: number }
  | { verdict: "indeterminate"; reason: string }
  | { verdict: "notApplicable"; reason: string }
```

The flagger uses the normal project-configured sample rate, hints, rate limits, and screening
decision infrastructure. The selection probability is stored before classification.

The existing flagger workflow writes only matched negative annotations. The task-failure judge extends it:

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

Recovered findings remain available to Cost and Speed because the telemetry reader returns them.
Cost records the incident in its recovery family and only adds spend, context, tool, or memory units
that a separate reader can attribute. A tool or memory span has no inherent billable cost. They do
not create additional scores or publish the `ScoreCreated` event used by signal discovery,
clustering, naming, monitor evaluation, and notifications. Signal discovery continues to receive the
one primary terminal finding, structural defect, or other finding selected by its evidence policy.

This separation prevents a session with several tool failures from manufacturing several annotation
scores or signal candidates. A calculated finding's stable `findingKey` includes its source identity
and finding kind, such as a tool-call id plus `error` or a span id plus `provider-error`. Re-screening
and daily recomputation produce the same key without a persisted observation id.

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
hash, and output hash. Three identical signatures in a row establish observed thrashing, not exact
waste.

Tool name and input alone are insufficient. Polling repeats arguments because the caller expects the
result to change. Empty captured arguments or output are also insufficient because every missing
value would collide.

The deterministic reader therefore:

- skips calls with empty captured input or output;
- compares output as well as name and input;
- returns every repeated occurrence and its resource use to the assessment resolver;
- publishes one stable loop finding for signal discovery.

`tools.repeated_call` uses the same signature without requiring consecutive calls. The session
counterfactual deduplicates the two metrics.

Signature equality alone cannot mark a call avoidable. Polling, time-dependent reads, and legitimate
revisits can return the same value before later progress. `redundancy: "confirmed"` requires tool
contract or captured state-version evidence that the prior result was still valid and the repeated
call could not advance external work. Confirmed repeats contribute exact tool-call equivalents and
marginal critical-path time. Their downstream input tokens or paid retry generation can contribute
context or spend only when separately attributed. Other repetitions are modeled evidence or context,
and their effect is estimated against comparable clean sessions rather than assigned as certain waste.

## Memory readers guard empty values

`memory.noop_rewrite` requires non-empty current and previous content hashes.
`memory.repeated_zero_hit` requires non-empty query text. `memory.reverted_write` requires non-empty
hashes for every compared version.

Rows that fail a guard lower reader coverage. They never count as a match.

## Repeated-character output needs usability evidence

`empty-response` treats a final assistant turn with blank or whitespace-only text and no tool call as
a terminal no-output finding. Reasoning alone does not satisfy the content requirement. A non-empty
repeated-character value is only a pattern candidate. It becomes terminal when an explicit output
schema, requested-output contract, or semantic usability judgment establishes that the value could
not satisfy the task.

An unconfirmed pattern can appear as modeled Outcome evidence or diagnostic context. It does not
anchor Outcome at zero, fail Reliability, or publish a terminal discovery event. The reader returns
`blank`, `confirmedUnusablePattern`, or `unconfirmedPattern` so the resolver does not reconstruct
usability from feedback text. When semantic confirmation comes from a model rather than a retained
schema or requested-output contract, that non-reproducible verdict is persisted with its artifact
version.

## Truncation requires output damage

A finish reason of `length` or `max_tokens` can describe a complete response produced under an
intentional output limit. Truncation becomes `spans.finish_failure` only when the final output also
contains observable damage reported by `output-schema-validation`.

Content filters, guardrail interventions, and malformed function calls do not need a second finding.
They have no equivalent healthy configured cause.

The structured finding records `generationPosition: "final" | "intermediate"`. A final broken generation
is terminal Outcome and Reliability evidence. An earlier broken generation that the session replaced
can contribute recovery-family Cost evidence, attributable retry-generation resources, and marginal
critical-path time where telemetry supports them.

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

```ts
type SafetyFindingKind =
  | "injectionAttempt"
  | "injectionDefense"
  | "injectionCompliance"
  | "piiExposure"
  | "piiDisclosure"
```

`injectionDefense` requires a confirmed attempt and an assistant response that resisted it. Merely
failing to find compliance is not a defense. Compliance and PII disclosure are confirmed harm;
attempt and PII exposure are context. The finding kind and its evidence anchor are persisted so the
session and project readers do not reinterpret feedback text.

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
  scoringArtifactVersion: string
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

The task-failure judge declares no hint kinds. Every readable session belongs to one uniform stratum
at the project-configured rate, recorded as `ordinary-sample`. A hinted stratum was the earlier
design and is deferred to a later scoring version: hinted classification is rate limited per
organization and slug, and a rate-limited hinted session records `selected: false` with inclusion
probability one, which drops failure-correlated sessions preferentially and is informative
missingness the ratio estimator cannot correct. Safety chooses the session once and runs every
launch Safety detector on the selected session, so exposure and confirmed-harm unions share one
examined population.

The initial Safety suite contains Jailbreaking and PII Leakage. NSFW remains contextual unless a
later structured result contract can identify assistant-caused harm.

The suite resolves its selection once per session and analysis generation, before any member is
screened. One sampling draw on a key that omits the slug puts both members on the same side of it,
at the lowest rate any enabled member is configured for, which is the only rate every member
satisfies. The rate limit is checked once in a bucket the suite shares, because members screen
concurrently: two calls against one bucket would consume two tokens and could still admit one member
while dropping the other, spending a model call on a session the estimator must then discard.

Whether a member was hinted stays that member's own fact, recorded in its own `hintKinds`. A member
the suite carried along was still examined with certainty, so it records `uniform-sample` at
inclusion probability one rather than an ordinary sample it never drew. Sharing hinted-ness across
the suite would also mute detectors suppressed by a member, since a bare-slug suppressor fires on
any hinted classification.

A member that cannot read the session records `outcome: "notApplicable"` rather than a selection
reason, so the suite still completes on the member that can. `skipped` stays reserved for the policy
skip above.

This table supports:

- inverse-probability correction for signal and flagger evidence;
- task-outcome and Safety examined populations;
- per-flagger coverage and rate-limiter diagnostics;
- confidence intervals over the examined population;
- an honest distinction between no finding and no examination.

## ClickHouse score fields

PR 2 adds only bounded provenance and linkage that belongs to a persisted flagger-authored score:

- `flagger_slug`;
- `scoring_artifact_version`;
- `flagger_finding_key` when the score was selected from a deterministic finding;
- `flagger_path`, either deterministic or sampled.

Recovery, terminal status, and other telemetry-derived fields remain outputs of the shared readers
and are not copied into Score. The task-failure judge uses the existing passed value plus its flagger identity.
Safety adds one bounded structured finding kind for exposure, defense, or confirmed harm. Postgres
score metadata remains the source for detailed feedback and evidence anchors.

The migration is forward-only. Existing ClickHouse rows are not backfilled. New columns must
represent missing historical values as null or unknown rather than false, clean, or unrecovered.
Historical deterministic facts can still be recalculated from retained telemetry; historical model
results without structured provenance remain examples or raw evidence and cannot enter a calibrated
reader. Coverage remains unavailable until enough new compatible decisions accumulate.

## Flagger controls

Flaggers remain switchable per project. Disabling a detector stops new observations and lowers
coverage. It cannot turn prior failures into successes or increase a dimension.

Muted and archived state affects discovery and triage. The scoring job reads recalculated
deterministic findings, persisted judgments, and screening coverage, not current workflow state.

Ignored signals are the exception defined in [`signals.md`](signals.md#which-signals-enter-estimation):
scores assigned to an ignored signal are excluded by the shared eligibility predicate.

Telemetry readers remain independent where practical. Provider errors and finish reasons come from
spans so disabling an overlapping flagger cannot hide operational failure.

## User-facing coverage

The Flaggers settings page keeps enablement and sampling controls primary. Each enabled flagger shows a muted 28-day observation summary, with the complete coverage breakdown available through inline progressive disclosure:

- eligible sessions;
- deterministic, hinted, uniformly sampled, ordinarily sampled, skipped, and rate-limited counts;
- readable share;
- positive findings split by kind;
- whether the finding can enter a calibrated score;
- unknown selection probability or missing telemetry warnings.

PR 2 groups persisted positive decisions by flagger kind in this view. More specific deterministic
sub-kinds are calculated from retained telemetry by the shared readers; they are not copied into the
screening-decision aggregate.

The session and signal pages name the finding kind rather than displaying a raw feedback paragraph as
the primary label.
