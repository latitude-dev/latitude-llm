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
- [x] **P1-5** Implement the static flagger mapping from
  [`signals.md`](signals.md#assignment-at-promotion).
- [x] **P1-6** Extend signal detail generation with evidence-role classification for signals that do
  not have a dominant mapped flagger.
- [x] **P1-7** Assign and latch `scoreEvidence` during promotion. Detail refresh must not rewrite it.
- [x] **P1-8** Backfill every existing signal with an empty, non-null `scoreEvidence` list in the
  schema migration. Do not classify historical signals with a model or the static flagger mapping.
- [x] **P1-9** Centralize signal score eligibility. Require promoted system signals, exclude scores
  assigned to ignored signals, and stop treating every non-empty `signal_id` as eligible.

### Product surfaces

- [x] **P1-10** Expose signal evidence through `@repo/operations`, OpenAPI, MCP, SDK methods, and the
  CLI. Regenerate generated contracts.
- [x] **P1-11** Add dimension chips to signal detail and the signal drawer.
- [x] **P1-12** Add dimension filters and chips to the Signals list without grouping or duplicating
  signal rows by dimension.
- [x] **P1-13** Add dimensions to signal rows in the session Signals tab.
- [x] **P1-14** Mark signals with no scoring role as diagnostic rather than assigning a fallback
  dimension.

### Exit gate

- [ ] **P1-15** Tests cover valid dimension-role pairs, static and generated assignment, promotion
  latching, generation failure, strict flagger dominance, refresh behavior, the non-null empty
  backfill, ignored-score exclusion, and promoted-only analytics.
- [ ] **P1-16** Signal detail, list filters, and session signal rows render the same dimension set.
- [ ] `pnpm typecheck` and `pnpm test` pass for touched packages. Generated API artifacts are current.

## PR 2: session assessment

**Product result**: the session Scores panel explains the session chronologically, including positive
evidence, failures, recovered incidents, signal occurrences, safety context, and missing coverage. It
does not display per-session dimension scores.

### Structured observations

- [ ] **P2-1** Extend flagger detection results and score metadata with the structured fields in
  [`flaggers.md`](flaggers.md#structured-findings), including confirmed versus unconfirmed
  repeated-character output.
- [ ] **P2-2** Surface tool finding kinds and both recovery meanings. Separate measurement
  persistence from signal-discovery publication for recovered incidents.
- [ ] **P2-3** Give flagger observations stable identities across re-screening.
- [ ] **P2-4** Add the finish-reason and provider-error classifiers required by
  [`metrics.md`](metrics.md#spans).
- [ ] **P2-5** Expose classified finish and provider error fields in span and session registries,
  filters, and detail views.
- [ ] **P2-6** Add the bounded ClickHouse score columns required by
  [`flaggers.md`](flaggers.md#clickhouse-score-fields), including scoring-artifact provenance. Create
  migrations only through `ch:create`.
- [ ] **P2-7** Backfill fields that historical metadata can establish. Do not infer unavailable
  recovery, terminal, or safety facts.

### Observation coverage

- [ ] **P2-8** Add the append-only flagger screening-decision table from
  [`flaggers.md`](flaggers.md#screening-decisions), including selection reason, inclusion
  probability, analysis-generation identity, append-only revision identity, attempt, and structured
  execution outcome.
- [ ] **P2-9** Write screening decisions before sampled model execution, reuse one sampling draw
  across retries, implement latest-generation consolidation, and preserve the existing summary log.
- [ ] **P2-10** Add coverage repositories and a per-flagger coverage view in Settings.

### Assessment domain and readers

- [ ] **P2-11** Create `@domain/agent-score` with the Zod-first session-assessment entities defined
  in [`session-assessment.md`](session-assessment.md#assessment-model).
- [ ] **P2-12** Implement the pure session-assessment resolver, including multi-dimension effects,
  benchmark-use classification, chronological ordering, deduplication, and coverage.
- [ ] **P2-13** Add single-session evidence ports and platform adapters for scores, signals, spans,
  moments, and screening decisions.
- [ ] **P2-14** Add bulk evidence contracts for later benchmark jobs. The single-session use-case and
  bulk path must share resolution logic without an N-plus-one query loop.
- [ ] **P2-15** Implement the project-scoped public session-assessment operation with stable cursor
  pagination, complete dimension summaries, and anchor-only payloads; regenerate HTTP, OpenAPI, MCP,
  SDK, CLI, and in-process tool contracts.

### Scores panel

- [ ] **P2-16** Add the Session assessment section to the existing Scores panel as specified in
  [`session-assessment.md`](session-assessment.md#scores-panel).
- [ ] **P2-17** Render dimension summaries, chronological evidence, direction, measured state,
  coverage, and occurrence counts.
- [ ] **P2-18** Add dimension, direction, source, and measured-state filters without duplicating
  multi-dimension items.
- [ ] **P2-19** Link signal, message, span, tool, and score evidence to their existing destinations.
- [ ] **P2-20** Preserve the current annotation and evaluation forms and the separate session Signals
  tab.

### Exit gate

- [ ] **P2-21** Resolver tests cover positive evidence, negative evidence, recovered incidents,
  multi-dimension items, source deduplication, missing coverage, and stable evidence keys.
- [ ] **P2-22** Integration fixtures cover no output, malformed final output, provider recovery,
  terminal tool failure, overlapping signals, and unexamined flaggers.
- [ ] **P2-23** The web panel and public operation return the same assessment semantics.
- [ ] **P2-24** Verify that session assessment is resolved dynamically and no session score or
  assessment snapshot is persisted.
- [ ] `pnpm typecheck` and `pnpm test` pass. ClickHouse schema dump contains only the expected changes.

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
- [ ] **P3-12** Add exact and estimated resource effects to the session-assessment resolver.

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

- [ ] **P4-9** Add Outcome evidence and calibrated effects to session assessment.
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
