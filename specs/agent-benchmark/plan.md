# Plan

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

This file tracks implementation order, dependencies, tasks, and exit gates. Product behavior and
data definitions live in the other benchmark specifications:

| Specification | Owns |
| --- | --- |
| [`README.md`](README.md) | product scope, dimension meanings, scoring rules, and fixed settings |
| [`session-assessment.md`](session-assessment.md) | one-session story, evidence model, deduplication, coverage, UI, and public operation |
| [`signals.md`](signals.md) | signal dimensions, evidence roles, assignment, eligibility, and effect estimation |
| [`flaggers.md`](flaggers.md) | structured findings, recovery, screening coverage, and safety confirmation |
| [`metrics.md`](metrics.md) | metric readers, native evidence, counterfactuals, and telemetry guards |
| [`score.md`](score.md) | window-level estimators, composite, confidence, attribution, snapshots, and versioning |
| [`page.md`](page.md) | benchmark page hierarchy, cause rows, coverage, and trend |

## Pull-request sequence

| PR | Feature | Depends on |
| --- | --- | --- |
| 1. Dimension-aware signals | signal classification becomes visible and reusable | none |
| 2. Session assessment | one session gets a dimension-aware evidence story | 1 |
| 3. Cost and Speed efficiency | avoidable money and critical-path time reach existing product pages | 1, 2 |
| 4. Outcome intelligence | calibrated task-success evidence reaches Sessions, Signals, and Behaviors | 1, 2 |
| 5. Safety assurance | exposure, defense, and confirmed harm become measurable | 1, 2 |
| 6. Agent Score benchmark | the five proven estimators become snapshots and a project benchmark | 1 through 5 |

PRs 3, 4, and 5 can run in parallel after PR 2. PRs 4 and 5 may be combined if review capacity favors
five pull requests, but their tasks and exit gates remain separate sections in the combined PR.

PRs 1 through 5 each ship a user-facing feature without requiring the benchmark page. PR 6 does not
introduce new evidence semantics. It composes the behavior already exercised by those features.

## PR 1: dimension-aware signals

**Product result**: every promoted signal says which Agent Score dimensions it informs. Users can
filter Signals by those dimensions, and API consumers receive the same classification. The Signals
list keeps one row per signal and shows dimensions as chips rather than grouping rows by dimension.

### Shared contracts

- [x] **P1-1** Add the shared dimension and evidence-role schemas defined in
  [`session-assessment.md`](session-assessment.md#shared-vocabulary) to `@domain/shared`.
- [x] **P1-2** Export the schemas through the browser-safe shared entry points used by Signals and
  the web app.

### Signal persistence and lifecycle

- [x] **P1-3** Add `scoreEvidence` to the canonical Signal entity and Postgres schema as defined in
  [`signals.md`](signals.md#scoring-metadata).
- [x] **P1-4** Generate the Postgres migration through the package migration script. Ask before
  running any migration command.
- [x] **P1-5** Implement the static flagger fallback mapping from
  [`signals.md`](signals.md#assignment-at-promotion).
- [x] **P1-6** Extend signal detail generation so one model call generates the promoted signal's
  name, description, and evidence-role classification together.
- [x] **P1-7** Assign and latch `scoreEvidence` during promotion. Detail refresh must not rewrite it.
- [x] **P1-8** Initialize existing signals with an empty, non-null `scoreEvidence` list in the
  schema migration.
- [x] **P1-9** Centralize signal score eligibility. Require promoted system signals, exclude scores
  assigned to ignored signals, and stop treating every non-empty `signal_id` as eligible.

### Product surfaces

- [x] **P1-10** Expose signal evidence through `@repo/operations`, OpenAPI, MCP, SDK methods, and the
  CLI. Regenerate generated contracts.
- [x] **P1-11** Add dimension chips to signal detail and the signal drawer.
- [x] **P1-12** Add dimension filters and chips to the Signals list without grouping or duplicating
  signal rows by dimension.
- [x] **P1-13** Add dimensions to signal rows in the session Signals tab.
- [x] **P1-14** Leave dimension surfaces empty for signals with no scoring role and ignored signals.

### Exit gate

- [x] **P1-15** Tests cover valid dimension-role pairs, generated assignment, static fallback,
  promotion latching, generation failure, strict flagger dominance, refresh behavior, the non-null
  empty backfill, ignored-score exclusion, ignored UI chips, and promoted-only analytics.
- [x] **P1-16** Signal detail, list filters, and session signal rows render the same dimension set.
- [x] `pnpm typecheck` and `pnpm test` pass for touched packages. Generated API artifacts are current.

## PR 2: session assessment

**Product result**: the session Scores panel explains the session chronologically, including positive
evidence, failures, recovered incidents, signal occurrences, safety context, and missing coverage. It
does not display per-session dimension scores.

### PR 2 decisions and boundaries

- Deterministic observations are calculated from retained telemetry by shared readers. They are not
  persisted as scores, measurement rows, or assessment snapshots.
- Scores remain authored or classifier-produced records. A discovery score can store a stable link
  to its deterministic source finding, but it does not copy the full finding into Score.
- Screening decisions are persisted because a missing score cannot distinguish no match from no
  examination.
- A delivered completion requires non-whitespace response text or at least one tool call. Reasoning
  alone is not a completion. A malformed tool call is output but can fail Reliability independently.
- The assessment exposes every finding returned by a deterministic reader even when only one primary
  finding was selected for signal discovery.
- The assessment has no dimension, direction, source, or measured-state filters. Its items are one
  chronological cursor-paginated feed.
- PR 2 defines no generic evidence-confidence field. PRs 3, 4, and 5 add uncertainty beside the
  concrete estimates they introduce; PR 6 owns project-level score intervals.
- ClickHouse changes are forward-only. Historical score rows are not backfilled, and absent
  structured fields remain unknown rather than false or healthy.

### Step 1: normalize deterministic finding contracts

- [x] **P2-1** Inventory the existing deterministic helpers and flagger adapters for empty output,
  schema damage, tool-call errors, and thrashing. Record which helper already calculates multiple
  findings and which adapter currently reduces those findings to one discovery score.
- [x] **P2-2** Define Zod-first source-domain finding contracts. Each finding carries a stable
  `findingKey`, a bounded `findingKind`, readable feedback, temporal anchors, and only the conditional
  fields valid for that kind.
- [x] **P2-3** Define deterministic reader results as a readability result plus a list of findings.
  An empty list from a readable reader means examined with no finding; unreadable input is a coverage
  result and never a healthy observation.
- [x] **P2-4** Generate `findingKey` from the immutable source fact: span id and kind, tool-call id and
  kind, message content hash and kind, or the equivalent stable source anchor. Do not use feedback,
  a mutable signal id, or list position as identity.
- [x] **P2-5** Keep the existing flagger adapters as discovery policy. They may select one primary
  finding from a deterministic reader and create the existing system annotation score, while the
  assessment and future bulk path consume the complete finding list.

### Step 2: establish completion and operational findings

- [x] **P2-6** Implement the shared output-content predicate over the final captured assistant turn:
  non-whitespace response text or at least one tool call is content; reasoning alone is not.
- [x] **P2-7** Update `empty-response` to return `blank`, `confirmedUnusablePattern`, or
  `unconfirmedPattern`. A tool-call-only turn is not empty, and no captured assistant turn is
  unreadable rather than failed.
- [x] **P2-8** Make the tool-call reader return every malformed call, duplicate id, orphan response,
  undeclared tool, and explicit failure instead of only the first discovery-worthy finding.
- [x] **P2-9** Calculate both recovery meanings from session chronology: `recovered` requires later
  successful progress and a usable completion; `sameSubjectRecovered` requires later success by the
  same tool or provider subject.
- [x] **P2-10** Keep recovered tool findings out of automatic `ScoreCreated` publication while
  returning them as Reliability context. Unrecovered terminal findings and structural defects retain
  the existing discovery policy.
- [x] **P2-11** Return structured output-schema damage with final-versus-intermediate position so a
  length finish reason is terminal only when observable damage confirms truncation.

### Step 3: classify span endpoints

- [x] **P2-12** Add the shared finish-reason classifier required by
  [`metrics.md`](metrics.md#spans), mapping provider-native values to `clean`, `unreliable`, or
  `unmapped` without treating a configured length stop as damaged output by itself.
- [x] **P2-13** Add the named provider-error classifier for rate limiting, overload, service failure,
  and provider rejection. Generic span error status remains insufficient.
- [x] **P2-14** Expose raw and classified values through browser-safe span and session contracts and
  their existing detail registries. Unmapped values remain visible and lower coverage.
- [x] **P2-15** Resolve provider recovery and final-versus-intermediate position from the full session
  chronology without writing a provider-finding score.

### Step 4: add minimal score provenance and linkage

- [x] **P2-16** Extend flagger-authored annotation metadata only with the stable source-finding link
  and scoring-artifact provenance needed for persisted classifier or discovery results. Keep legacy
  metadata valid and optional.
- [x] **P2-17** Ensure a deterministic discovery score references its selected `findingKey`; the
  resolver uses that reference to merge the score and any assigned signal into the calculated
  finding's assessment item.
- [x] **P2-18** Persist structured model verdicts only when the result cannot be reconstructed. Do
  not copy telemetry-derived recovery, terminal, resource, or safety fields into the generic Score
  entity.
- [x] **P2-19** Add only the bounded ClickHouse score columns defined in
  [`flaggers.md`](flaggers.md#clickhouse-score-fields), using `ch:create`. Make historical absence
  explicit with nullable or unknown values and dual-write the fields for new scores.
- [x] **P2-20** Do not backfill historical Postgres metadata or ClickHouse score rows. Verify that
  legacy scores remain readable as annotations or raw evidence and cannot be mistaken for compatible
  structured observations.

### Step 5: persist examination coverage

- [x] **P2-21** Add the append-only flagger screening-decision ClickHouse table from
  [`flaggers.md`](flaggers.md#screening-decisions), including organization and project scope,
  deterministic decision id, analysis hash, artifact version, attempt, revision version, selection,
  selection reason, inclusion probability, hint kinds, outcome, timestamp, and retention TTL.
- [x] **P2-22** Write the initial decision before sampled model execution. A terminal outcome appends
  a higher revision with the same decision and selection fields.
- [x] **P2-23** Reuse one sampling draw and inclusion probability across retries. Increment attempts
  without redrawing selection, and preserve the existing human-readable summary log.
- [x] **P2-24** Implement repository consolidation that selects the latest revision of the newest
  analysis generation per session and flagger at the query cutoff. Never fall back to an older
  successful generation when the newest is pending or failed.
- [x] **P2-25** Map disabled, suppressed, missing-flagger, and missing-context policy outcomes to the
  single public coverage limitation `skipped`. Preserve statistically distinct `notSelected`,
  `rateLimited`, `executionFailed`, and missing-telemetry states.
- [x] **P2-26** Add organization- and project-scoped coverage repositories plus the Settings view for
  eligible, examined, readable, selection-path, rate-limited, finding-kind, and calibration-readiness
  counts.

### Step 6: build the assessment domain

- [x] **P2-27** Create `@domain/agent-score` and implement the Zod-first assessment item, effect,
  impact, dimension-summary, reader-coverage, anchor, destination-list, and pagination contracts from
  [`session-assessment.md`](session-assessment.md#assessment-model). Do not add per-session scores,
  filter inputs, or a generic confidence type.
- [x] **P2-28** Define single-session source ports for conversation and tool telemetry, spans,
  scores, signals, moments, and screening decisions. Ports return source facts; platform adapters do
  not assign benchmark meaning.
- [x] **P2-29** Implement source readers that normalize telemetry-derived findings and persisted
  judgments into the shared assessment input. A page request must not run an LLM classifier.
- [x] **P2-30** Implement the pure resolver for multi-dimension effects, direction, measurement state,
  benchmark use, impact, anchors, destinations, and chronological ordering. One deduplicated item can
  expose several destinations.
- [x] **P2-31** Deduplicate by the underlying source fact. Merge a metric, its discovery score, and
  assigned signals into one item; group repeated identical calls with `occurrenceCount`; never merge
  independent human evidence into an automatic observation.
- [x] **P2-32** Build all five dimension summaries from deduplicated effects. Keep direction and
  measurement counts separate, distinguish zero from unknown native values, and never emit a
  per-session dimension number.
- [x] **P2-33** Build reader-level coverage. Distinguish examined with zero findings, partial
  readability, not examined, and not applicable; derive each dimension's coverage from its relevant
  readers without an assessment-wide complete flag.
- [x] **P2-34** Add bulk source contracts and adapters for later benchmark jobs. Batch by organization,
  project, session ids, and cutoff; feed the same pure readers and resolver without calling the
  interactive use-case or creating an N-plus-one query loop.

### Step 7: expose the operation

- [x] **P2-35** Implement the project-scoped session-assessment use-case. Resolve all trace ids for
  the session, include orphan score relationships where authorized, and enforce organization and
  project scope on every source read.
- [x] **P2-36** Add stable cursor pagination over chronology plus `evidenceKey`, with complete
  dimension summaries and coverage returned alongside each page. The input contains project,
  session, and optional cursor only; it has no assessment filters.
- [x] **P2-37** Define the public operation through `@repo/operations` with anchor-only payloads and
  descriptions suitable for HTTP, OpenAPI, MCP, SDKs, CLI, and in-process tools. Regenerate and
  verify every generated contract.

### Step 8: build the Scores panel

- [x] **P2-38** Add the Session assessment section above the existing annotations and evaluations in
  the stable Scores tab.
- [x] **P2-39** Render the five dimension summaries, reader coverage, and one chronological evidence
  feed with direction, measurement state, native impact, and occurrence count. Do not add assessment
  filter controls.
- [x] **P2-40** Link message, span, tool-call, score, and signal anchors to their existing authorized
  destinations without copying raw content into the assessment response.
- [x] **P2-41** Render legacy or custom records without benchmark semantics in Raw evidence, and keep
  the existing editable annotation forms, evaluation cards, and separate session Signals tab intact.
- [x] **P2-42** Support cursor-driven incremental loading and virtualization so sessions with more
  than 100 evidence items are not truncated.

### Step 9: verification and exit gate

- [ ] **P2-43** Unit tests cover the text-or-tool-call completion predicate, reasoning-only output,
  tool-call-only output, malformed tool calls, no captured assistant turn, blank output, and confirmed
  versus unconfirmed repeated-character output.
- [ ] **P2-44** Reader tests cover every tool finding kind, multiple findings in one session, both
  recovery meanings, provider recovery, finish-reason damage pairing, unmapped telemetry, and stable
  finding keys across recomputation.
- [ ] **P2-45** Persistence tests prove that multiple deterministic findings do not create additional
  score rows or discovery events, the selected discovery score links to its finding, model verdicts
  retain provenance, and legacy scores remain unknown rather than falsely classified.
- [ ] **P2-46** Screening tests cover pre-execution writes, retries without resampling, append-only
  revisions, newest-generation consolidation, skipped-policy normalization, sampled-out sessions,
  rate limits, failures, and known inclusion probabilities.
- [ ] **P2-47** Resolver tests cover positive and negative evidence, recovered context,
  multi-dimension effects, score/signal/finding deduplication, occurrence grouping, missing coverage,
  dimension summaries, stable chronology, and cursor pagination.
- [ ] **P2-48** Run identical fixtures through single-session and bulk adapters and assert byte-level
  parity of normalized facts and resolved semantics, excluding pagination envelopes.
- [ ] **P2-49** Integration fixtures cover no output, malformed final output, several tool failures
  with only one discovery score, provider recovery, terminal tool failure, overlapping signals,
  ignored signal scores, and unexamined flaggers.
- [ ] **P2-50** Verify the web panel and public operation render the same assessment semantics and
  that the operation exposes no assessment-filter or confidence fields.
- [ ] **P2-51** Verify dynamically that loading an assessment writes no score, observation,
  measurement, or assessment row and invokes no model. Only the already-authorized screening
  workflow writes screening decisions and classifier scores.
- [ ] **P2-52** Measure the largest representative single-session and bulk fixture to confirm bounded
  query count, no N-plus-one reads, stable page size, and acceptable resolver memory use.
- [ ] `pnpm typecheck` and `pnpm test` pass for every touched package. Generated API artifacts are
  current, and the ClickHouse schema dump contains only the forward-only score and screening-decision
  changes.

## PR 3: Cost and Speed efficiency

**Product result**: Cost, Tools, Memory, Sessions, Signals, and session assessment show measured
avoidable money and critical-path time.

### Resource foundations

- [ ] **P3-1** Add per-session pricing coverage that distinguishes known zero-priced activity from
  missing pricing.
- [ ] **P3-2** Add critical-path reconstruction with correct handling of concurrent spans and
  background work. Enforce complete Cost and Speed resource bases while retaining exact observations
  from incomplete sessions as unscored session evidence.
- [ ] **P3-3** Build and freeze the fleet latency references defined in
  [`metrics.md`](metrics.md#frozen-latency-references). Inspect the aggregation output for tenant
  leakage before freezing it.
- [ ] **P3-4** Add cohort-aware TTFT and throughput comparisons to existing session and trace views.

### Waste readers

- [ ] **P3-5** Implement the tool repetition, thrashing, dead-surface, failed-call, and structural
  readers in [`metrics.md`](metrics.md#tools), including every telemetry guard, redundancy proof,
  and polling-safe modeled fallback for repeated calls.
- [ ] **P3-6** Implement the memory waste readers in [`metrics.md`](metrics.md#memory).
- [ ] **P3-7** Implement cache opportunity in [`metrics.md`](metrics.md#cost).
- [ ] **P3-8** Carry recovered provider and tool retry resources into session evidence.

### Counterfactual and signal effects

- [ ] **P3-9** Implement the bounded Cost and Speed session counterfactuals specified in
  [`score.md`](score.md#cost) and [`score.md`](score.md#speed).
- [ ] **P3-10** Give exact readers precedence over modeled signal effects and prevent concurrent or
  overlapping work from being counted twice.
- [ ] **P3-11** Implement matched residual Cost and Speed signal effects with sampling correction,
  shrinkage, and effect-not-measured results as specified in [`signals.md`](signals.md#cost-and-speed).
- [ ] **P3-12** Add exact and estimated resource effects to the session-assessment resolver. Define
  Cost and Speed uncertainty beside the concrete microcent or nanosecond estimate in this PR rather
  than introducing a target-based generic confidence field.

### Product surfaces

- [ ] **P3-13** Show recoverable spend and pricing coverage on Cost.
- [ ] **P3-14** Show repeated calls, thrashing, dead definitions, and their native impact on Tools.
- [ ] **P3-15** Show repeated searches, no-op writes, and reverted writes on Memory.
- [ ] **P3-16** Show avoidable critical-path time and cohort comparisons on Sessions.
- [ ] **P3-17** Show measured or associated Cost and Speed effects on signal detail.

### Exit gate

- [ ] **P3-18** Tests prove that avoidable spend does not exceed actual spend and avoidable time does
  not exceed observed critical-path time.
- [ ] **P3-19** Tests cover polling, empty telemetry, concurrent spans, reader overlap, unmatched
  pricing, cohort fallback, and split-signal invariance.
- [ ] **P3-20** Inspected fixtures reconcile session-assessment amounts with the existing product
  pages.
- [ ] `pnpm typecheck` and `pnpm test` pass.

## PR 4: Outcome intelligence

**Product result**: Sessions, Signals, and Behaviors show calibrated evidence about whether the agent
accomplished the requested task.

### Task Success flagger

- [ ] **P4-1** Add the configurable `task-success` LLM-as-judge flagger and holistic verdict contract
  from [`flaggers.md`](flaggers.md#task-success).
- [ ] **P4-2** Extend the flagger workflow to persist passed scores for success, failed scores for
  failure, and coverage-only decisions for indeterminate and not-applicable results. Stamp every
  decision and score with its scoring-artifact version.
- [ ] **P4-3** Publish failed Task Success scores to normal signal discovery while preventing passed
  scores from creating signals.
- [ ] **P4-4** Store selection probabilities before classification and preserve hinted, sampled,
  skipped, rate-limited, and errored outcomes.

### Outcome model

- [ ] **P4-5** Train and calibrate the Outcome model with cross-fitting and the endpoint anchors
  specified in [`score.md`](score.md#outcome).
- [ ] **P4-6** Implement hierarchical effects for newly promoted Outcome signals.
- [ ] **P4-7** Validate calibration overall and across organization size, behavior cluster, model,
  and interaction shape.
- [ ] **P4-8** Freeze the model artifact, feature contract, and validation distribution under a
  scoring-version identifier. Pin supported judge configurations and support the same artifact in
  self-hosted deployments. Define compatible evidence-artifact versions and re-evaluation or
  withholding behavior at boundaries. Verify that the artifact contains no tenant content or
  tenant-identifying coefficients.

### Product surfaces

- [ ] **P4-9** Add Outcome evidence and calibrated effects to session assessment, defining
  probability uncertainty beside the concrete probability or probability-change estimate.
- [ ] **P4-10** Add success estimates and evidence coverage to Behaviors by topic cluster.
- [ ] **P4-11** Add measured Outcome association, independent observation count, and confidence to
  eligible signal details.
- [ ] **P4-12** Mark signals whose Outcome effect is not yet measurable without hiding their session
  occurrences.

### Exit gate

- [ ] **P4-13** Tests cover Task Success verdict persistence, positive-score discovery exclusion,
  feature extraction, endpoint anchors, selection correction, cross-fit exclusion, signal
  shrinkage, duplicate evidence, and model-version loading.
- [ ] **P4-14** Calibration meets the acceptance thresholds recorded with the frozen model artifact.
- [ ] **P4-15** Session, Signal, and Behavior views reconcile against the same inspected fixtures.
- [ ] `pnpm typecheck` and `pnpm test` pass.

## PR 5: Safety assurance

**Product result**: Sessions, Signals, and Settings distinguish hostile input, successful defense,
and confirmed agent-caused harm, with measurable examination coverage.

### Safety findings

- [ ] **P5-1** Separate injection attempt from assistant compliance as specified in
  [`flaggers.md`](flaggers.md#injection-attempt-and-compliance).
- [ ] **P5-2** Separate user-authored PII exposure from assistant disclosure.
- [ ] **P5-3** Persist exposure, defense, and confirmed-harm fields through score metadata and
  ClickHouse readers.

### Examination and estimation

- [ ] **P5-4** Add suite-level Safety selection on the screening infrastructure from PR 2. Selected
  sessions run every launch Safety detector with a shared inclusion probability.
- [ ] **P5-5** Implement the examined population, confirmed-harm union, selection correction, and
  coverage gates defined in [`score.md`](score.md#safety).
- [ ] **P5-6** Implement Safety interval and reference-run estimation as a reusable domain result.
- [ ] **P5-7** Keep exposure outside confirmed-harm arithmetic and report successful defense as
  positive session evidence. Treat the structured jailbreaking verdict as confirmation when it
  includes the assistant action that complied.

### Product surfaces

- [ ] **P5-8** Add exposure, defense, confirmed harm, and examination coverage to session assessment.
- [ ] **P5-9** Add the same distinction and measurable rates to Safety signal detail.
- [ ] **P5-10** Add uniform, sampled, hinted, skipped, and rate-limited Safety coverage to Flagger
  Settings.

### Exit gate

- [ ] **P5-11** Tests prove that exposure never enters confirmed harm and unexamined sessions never
  become clean observations.
- [ ] **P5-12** Fixtures cover refused and complied-with injections, user and assistant PII, multiple
  detectors on one harmed session, and incomplete coverage.
- [ ] **P5-13** Session, Signal, and Settings views agree on the examined population and findings.
- [ ] `pnpm typecheck` and `pnpm test` pass.

## Requirements before PR 6

PR 6 starts only when all of these gates pass:

- [ ] Every promoted signal has stable evidence roles or is explicitly diagnostic.
- [ ] Session assessment resolves the same source facts in single-session and bulk mode.
- [ ] Structured findings distinguish recovery, terminal failure, exposure, defense, and harm.
- [ ] Sampled evidence has a known examined population or remains unmeasured.
- [ ] Cost and Speed counterfactuals are bounded and visible on existing pages.
- [ ] Outcome uses sampled Task Success verdicts, known inclusion probabilities, and a frozen,
  calibrated model.
- [ ] Safety uses a full-window examined population and confirmed-harm definition.
- [ ] Duplicate detectors and split signals pass invariance tests.
- [ ] Every reader exposes coverage and missing-evidence reasons.
- [ ] Frozen fleet references and model identifiers are ready for a scoring version.
- [ ] All five dimensions pass their publication floors together on representative traffic; no
  partial dimension or composite number is exposed when one fails.

## PR 6: Agent Score benchmark

**Product result**: a complete benchmark page and public score history combine the five estimators
already exercised elsewhere in the product.

### Score engine

- [ ] **P6-1** Add window selection, session eligibility, and applicability gates from
  [`score.md`](score.md#eligible-sessions) and [`score.md`](score.md#the-window).
- [ ] **P6-2** Implement all five window estimators by composing bulk session evidence. Do not add
  metric-specific scoring arithmetic.
- [ ] **P6-3** Implement complete-session bootstrap intervals, boundary-aware endpoint intervals,
  the all-five-dimensions publication gate, the fixed composite, optional policy cap, and
  scoring-version boundaries from [`score.md`](score.md).
- [ ] **P6-4** Implement dynamic attributed deficit, fix gain, residual, grouped causes, and bounded
  Shapley approximation from [`score.md`](score.md#dynamic-attribution-after-scoring).

### Persistence and jobs

- [ ] **P6-5** Add the immutable, organization-scoped `agent_score_snapshots` Postgres table and
  repository.
- [ ] **P6-6** Register project sweep and snapshot queue tasks with organization and project ids.
- [ ] **P6-7** Add the daily worker, bounded project fan-out, idempotent snapshot write, and largest
  project performance measurement.
- [ ] **P6-8** Store only the composite and five dimension point estimates and intervals, scoring
  version, selected window, eligible-session count, date, and identity fields required by
  [`score.md`](score.md#the-daily-snapshot). Write nothing when the publication gate fails.

### Public and web surfaces

- [ ] **P6-9** Expose the current UTC date's snapshot and history through `@repo/operations`, HTTP,
  OpenAPI, MCP, SDKs, CLI, and in-process agent tools. Do not substitute an older snapshot when the
  current score is unavailable.
- [ ] **P6-10** Add the feature-flagged Agent Score route first in the Observe group.
- [ ] **P6-11** Build level one, dimension sections, dynamic cause rows, coverage, unavailable-score
  behavior, and trend exactly as specified in [`page.md`](page.md).
- [ ] **P6-12** Link benchmark causes back to the same session, signal, tool, memory, Cost, Behavior,
  and Settings destinations used by session assessment.
- [ ] **P6-13** Run one complete 28-day shadow window, validate deterministic reruns, coverage,
  calibration, hosted and self-hosted artifact loading, and all-five publication on representative
  traffic before removing the feature flag.

### Exit gate

- [ ] **P6-14** Pure tests cover every formula boundary, all-five publication, unavailable scores,
  zero-event endpoint intervals, dynamic attribution closure, policy-cap separation, and
  scoring-version change.
- [ ] **P6-15** Integration tests cover snapshot RLS, idempotency, queue payload scope, bulk evidence,
  rendering headline and history from frozen snapshot data, and dynamic current-native-input and
  cause queries that are never presented as historical decomposition.
- [ ] **P6-16** End-to-end fixtures cover every metric, signal role, overlap case, missing-coverage
  case, and destination.
- [ ] **P6-17** One full run on the largest project meets the agreed query, worker, snapshot-size,
  and page-load performance targets.
- [ ] `pnpm typecheck` and `pnpm test` pass. Generated contracts and schemas are current.

## Verification rules

- Never invoke `tsc`; use package or workspace `typecheck` scripts.
- Create ClickHouse migrations only with
  `pnpm --filter @platform/db-clickhouse ch:create <migration_name>`.
- Generate Postgres migrations through the package scripts and ask before running migration commands.
- Use repository tests for both organization and project scope.
- Check single-session and bulk resolver parity on the same fixtures.
- Check that ignored signal scores are excluded while every other signal lifecycle field remains
  score-neutral.
- Check that traffic duplication, duplicate detectors, and equivalent signal splits preserve scores.
- Render benchmark history entirely from minimal immutable snapshots and current causes from dynamic
  evidence queries.

## Documentation promotion

After PR 6 has run on representative traffic, promote stable behavior into the durable documentation
homes listed in [`README.md`](README.md). Keep this file as the implementation tracker until every
exit gate is complete.
