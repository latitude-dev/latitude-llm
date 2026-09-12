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
| 3. Cost and Speed efficiency | versioned Cost-family evidence and avoidable critical-path time reach existing product pages and shadow scoring | 1, 2 |
| 4. Outcome intelligence | Outcome evidence reaches session Scores and supports a project Outcome score and issue list | 1, 2, 3 |
| 5. Safety assurance | Safety evidence reaches session Scores and supports a project Safety score and issue list | 1, 2, 3 |
| 6. Agent Score benchmark | the five proven estimators become snapshots and a project benchmark | 1 through 5 |

PRs 4 and 5 can run in parallel after PR 3. They share one small additive structured-flagger-result
contract: the widened `RunFlaggerResult` and `ClassifySessionFlaggerResult` that let a non-negative
classifier outcome carry feedback and anchors. PR 4 landed that widening, and PR 5's launch suite
reuses two registered detectors, so PR 5 adds no `FLAGGER_STRATEGY_SLUGS` member and the two
branches do not contend over the public flagger enum or its generated artifacts.

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
- PR 2 defines no generic evidence-confidence field. PR 3 adds ranges beside its native estimates,
  PRs 4 and 5 add reader-specific examination coverage, and PR 6 owns project-level score
  intervals.
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

- [x] **P2-43** Unit tests cover the text-or-tool-call completion predicate, reasoning-only output,
  tool-call-only output, malformed tool calls, no captured assistant turn, blank output, and confirmed
  versus unconfirmed repeated-character output.
- [x] **P2-44** Reader tests cover every tool finding kind, multiple findings in one session, both
  recovery meanings, provider recovery, finish-reason damage pairing, unmapped telemetry, and stable
  finding keys across recomputation.
- [x] **P2-45** Persistence tests prove that multiple deterministic findings do not create additional
  score rows or discovery events, the selected discovery score links to its finding, model verdicts
  retain provenance, and legacy scores remain unknown rather than falsely classified.
- [x] **P2-46** Screening tests cover pre-execution writes, retries without resampling, append-only
  revisions, newest-generation consolidation, skipped-policy normalization, sampled-out sessions,
  rate limits, failures, and known inclusion probabilities.
- [x] **P2-47** Resolver tests cover positive and negative evidence, recovered context,
  multi-dimension effects, score/signal/finding deduplication, occurrence grouping, missing coverage,
  dimension summaries, stable chronology, and cursor pagination.
- [x] **P2-48** Run identical fixtures through single-session and bulk adapters and assert byte-level
  parity of normalized facts and resolved semantics, excluding pagination envelopes.
- [x] **P2-49** Integration fixtures cover no output, malformed final output, several tool failures
  with only one discovery score, provider recovery, terminal tool failure, overlapping signals,
  ignored signal scores, and unexamined flaggers.
- [x] **P2-50** Verify the web panel and public operation render the same assessment semantics and
  that the operation exposes no assessment-filter or confidence fields.
- [x] **P2-51** Verify dynamically that loading an assessment writes no score, observation,
  measurement, or assessment row and invokes no model. Only the already-authorized screening
  workflow writes screening decisions and classifier scores.
- [x] **P2-52** Measure the largest representative single-session and bulk fixture to confirm bounded
  query count, no N-plus-one reads, stable page size, and acceptable resolver memory use.
- [x] `pnpm typecheck` and `pnpm test` pass for every touched package. Generated API artifacts are
  current, and the ClickHouse schema dump contains only the forward-only score and screening-decision
  changes.

## PR 3: Cost and Speed efficiency

**Product result**: Cost, Tools, Memory, Sessions, Signals, and session assessment show the same
versioned Cost-family evidence and measured or estimated native impact. Speed shows avoidable
critical-path time. PR 3 calculates project Cost and Speed over shadow windows for calibration and
performance validation; PR 6 publishes the benchmark and snapshots.

### Decisions fixed for this PR

- Cost is a 0 through 100 cost-efficiency score. It is not limited to avoidable dollars and does not
  claim that its number is the percentage of spend that was necessary.
- Cost has five stable families: spend, context, tools, memory, and recovery. Metrics have versioned
  response curves inside a family; they do not own independent point budgets.
- Estimated recoverable money remains a first-class metric and display value. A Cost observation can
  still score in tokens, operation equivalents, or sessions, or another family-native denominator
  when a dollar estimate is not defensible.
- Tool and memory spans have no inherent billable cost. Their spend or context effect must be
  attributed to a paid model generation or later model input.
- Raw context-window utilization is explanatory only. Cost penalizes context pressure only when
  redundant content atoms can be identified or bounded.
- Signals linked to deterministic source atoms explain existing family penalties. Unlinked signals
  can enter only a grouped, corrected, and capped residual estimator.
- Speed keeps its necessary-critical-path-time interpretation. Per-trace critical paths are summed
  because traces within a session are sequential. Background and auxiliary work does not lower
  Speed unless it delays a foreground interaction.
- Session assessment shows raw values, measurement state, native impact, and coverage. Raw adverse
  units become attention findings; a measured zero becomes positive evidence only with complete
  visibility. It does not show calibrated health labels or a session-level Cost or Speed score.
- Prefer new projections over data migrations. Existing spans contain usage, costs, content columns,
  tool definitions, timestamps, parents, and semantic attributes; existing memory events contain the
  hashes, operations, token counts, and session linkage needed for the launch readers.

### Current implementation gaps to remove

- `NormalizedSessionAssessmentInput` carries only total session cost and `Session.durationNs`.
  `durationNs` is active root-span duration, not reconstructed critical-path time.
- The bulk ClickHouse source returns lean spans with empty attribute maps and no full generation
  inputs, tool definitions, tool payloads, or memory events. The current latest conversation window
  cannot attribute content across every generation in a multi-trace session.
- `resolve-assessment-findings.ts` currently gives every provider error its full span cost and time,
  even when terminal. `build-dimension-summaries.ts` then sums known impacts without source-atom
  overlap or family caps.
- Deterministic thrashing compares tool name and argument preview, not name, normalized input, and
  output hash. Tool error classification treats every HTTP 400 through 499 response as expected
  without caller-declared evidence.
- Cache economics already models TTL, cadence, prices, and achievable volume, but its cadence-only
  ceiling does not prove that request prefixes match.
- The model registry has context limits and the repository has an `o200k_base` tokenizer. Normalized
  `GenAIMessage` content still differs from provider wire serialization, so content attribution is
  estimated and must be bounded.
- Memory events are retained and session-scoped, but the assessment bulk source has no bounded
  multi-session memory projection.
- Persisted Cost signal roles use `spendEfficiency`. PR 3 must interpret that as the general Cost
  channel at read time so existing signal JSON needs no migration.

### Ownership boundaries

- `@domain/agent-score` owns Cost families, metric definitions, curves, source-atom arbitration,
  critical-path counterfactual composition, uncertainty, session summaries, and window sufficient
  statistics.
- Source domains own normalized telemetry facts and reusable helpers. `@domain/spans` keeps pricing,
  model-call, cache, tool, and trace semantics; `@domain/memories` keeps memory-event semantics.
- `@platform/db-clickhouse` reads scoped compact facts and performs safe source-side aggregation. It
  does not decide healthy ranges, family weights, avoidability, or score policy.
- `@repo/operations` describes and exposes the domain contract. The web app composes domain use cases
  with platform layers and renders the result without reimplementing evaluation rules.
- PR 3 shadow tooling reads and reports. PR 6 owns snapshot persistence, scheduling, historical score
  APIs, and the Agent Score route.

### Step 1: define the versioned evidence and scoring contracts

- [x] **P3-1** Add `CostFamily`, aggregation mode, metric status, applicability, readability,
  same-unit estimate range, and source-atom identity contracts under `@domain/agent-score`. Keep the
  Zod schemas as the source of truth for domain, public, and browser types.
- [x] **P3-2** Define a metric catalog whose entries include id, family, reader, raw unit,
  aggregation mode, monotone curve id, overlap group, applicability rule, coverage floor, and
  product destinations. Reject duplicate ids, invalid curves, negative units, and family/unit
  mismatches at artifact load.
- [x] **P3-3** Define a `CostScoringArtifact` containing family weights, metric curve points, metric
  and family caps, required-family coverage floors, the residual-signal cap, tokenizer policy, and
  artifact version. Validate that family weights sum to one and all caps and floors are bounded.
  Keep initial numeric values provisional until shadow calibration; never bury launch constants in
  readers or UI code.
- [x] **P3-4** Preserve the persisted `ScoreEvidenceContract` value `cost/spendEfficiency` as a
  compatibility channel. Resolve Cost family from deterministic linkage or the residual estimator
  without a Postgres backfill.
- [x] **P3-5** Extend session assessment impacts and dimension summaries with Cost family, aggregate
  raw value and unit, measurement state, eligible and adverse units, native point estimate,
  optional same-unit range, and range interpretation. Do not add calibrated health labels or a
  per-session 0 through 100 value.

### Step 2: build compact bulk source facts

- [x] **P3-6** Extend `SessionAssessmentBulkSource` with compact generation facts keyed by session,
  trace, and span. Include operation, provider/model, parent and timestamps, foreground interaction
  attributes, token classes, cost sides and source, finish/error fields, capture flags, input
  messages, output messages, and tool definitions. Select only the columns used by PR 3.
- [x] **P3-7** Add compact tool-call facts with stable call/result ids, normalized name, canonical
  input hash, output hash, error/status evidence, timestamps, and trace/span linkage. Reuse the
  existing message-to-span mapping for navigation, but do not treat it as exact later-prompt token
  attribution.
- [x] **P3-8** Add an organization and project scoped, multi-session memory-event read to the memory
  repository and the bulk source. Return operation, change kind, record/store ids, content hash,
  token count, query text, result count, timestamps, and span/trace/session linkage.
- [x] **P3-9** Implement the ClickHouse reads in
  `packages/platform/db-clickhouse/src/repositories/session-assessment-bulk-source.ts` as bounded
  batched queries for the selected session ids and cutoff. Do not load `SpanDetail` per session or
  issue one query per session. Preserve the current one bulk telemetry read plus one judgment read
  shape per batch. Page content by a fixed session and byte budget so large prompts cannot make a
  thousand-session window resident in memory at once.
- [x] **P3-10** Add explicit content and model coverage facts: captured, absent, truncated, unknown
  provider/model, unknown context limit, unpriced, known local/free, and legacy unknown cost. Start
  without a migration. If retained columns cannot distinguish a required state, stop and propose the
  smallest migration with backfill and rollout impact before generating it.

### Step 3: reconstruct Speed's resource base

- [x] **P3-11** Add a pure critical-path builder under `@domain/agent-score` or `@domain/spans` that
  groups spans by trace, uses parent/child and tool-call dependencies, preserves concurrency, and
  returns ordered path segments, marginal contribution ids, provenance, and completeness reasons.
  Reuse the structural ownership rules in `build-agent-graph.ts` where applicable. A complete
  foreground root supplies the trace's observed elapsed interval; descendants explain that interval
  and are never added on top of their parent envelope.
- [x] **P3-12** Classify foreground roots from `span.type=interaction` and `interaction.kind`.
  Include user-visible foreground interactions; exclude subagent, background, and auxiliary work
  unless a dependency proves that it delayed the foreground result. Unknown semantic attributes
  lower classification coverage instead of being guessed.
- [x] **P3-13** Sum complete per-trace critical paths for the session. Do not use session wall clock,
  sum all span durations, or union all intervals. Return exact observed segments from incomplete
  traces for the session UI, but exclude incomplete sessions from the Speed project denominator.
  Compute an observation's marginal avoidable time by rerunning completion over the dependency graph
  with that segment removed or replaced by its cohort expectation.
- [x] **P3-14** Build and freeze TTFT and throughput reference distributions by provider, model,
  input bucket, output bucket where applicable, and streaming mode. Inspect fleet aggregation for
  tenant leakage and pin the artifact version and fallback behavior.

### Step 4: implement Cost readers in native units

- [x] **P3-15** Reuse `classify-unpriced-cost.ts` and span cost-source parsing to build session
  pricing coverage. Keep provider-reported and registry-estimated spend distinct. Only explicit
  local-runtime and free-tier cases are known zero; missing provider/model and catalog-declined
  pricing remain unknown. The estimator must remain fully usable when every priced value came from
  the registry rather than a provider report.
- [x] **P3-16** Add `cost.recoverable_spend_share` as the deduplicated union of attributable paid
  generation atoms. Provider-reported totals can be observed spend while component savings remain
  registry-estimated. Return identification bounds when a total cannot be split exactly by token
  class.
- [x] **P3-17** Extend the existing cache-economics helpers for session and window evidence. Compare
  readable prompt prefixes where possible; otherwise expose the cadence-only ceiling as an upper
  identification bound. Keep the existing 20-call, 1,024-average-input-token, and 10-point material
  gap guards as calibration candidates rather than silently using them as the score curve.
- [x] **P3-18** Build a reusable content-atom ledger for each generation input. Attribute retained
  tool calls/results, memory-derived content, prior generations, and tool definitions to later model
  inputs using stable hashes and chronology. Reconcile atom estimates to reported input tokens and
  keep unassigned framing or hidden provider content as an explicit residual.
- [x] **P3-19** Implement `context.redundant_input_share` and `context.avoidable_pressure`. Use
  provider-aware tokenization when available, otherwise the existing `o200k_base` approximation.
  Penalize only atoms another reader establishes as redundant; raw prompt size and context-window
  use remain display-only.
- [x] **P3-20** Implement `tools.repeated_call` and `tools.thrashing` from name, canonical input hash,
  and output hash. Guard empty content and polling or time-dependent reads. Deduplicate the loop and
  repeated-call views through shared call source atoms.
- [x] **P3-21** Correct tool failure classification so HTTP status is evaluated against an explicit
  caller-declared expected-status contract. Count recovered failed calls in Recovery and recovered
  structural defects in Tools so the same incident has one primary Cost family. Attach spend,
  context, or Speed impact only through proven downstream generations or critical-path segments.
- [x] **P3-22** Implement `tools.dead_surface` from definitions repeatedly present in model inputs
  but unused since first observation. Score its estimated serialized tokens in Context, not an
  invented tool execution cost. Treat name mismatches and missing definitions as coverage warnings.
- [x] **P3-23** Implement guarded memory readers for repeated non-empty zero-hit queries, non-empty
  no-op writes, and same-session reverted writes. Emit memory-operation equivalents. Attribute later
  prompt tokens or paid retry generations separately when a content link is readable.
- [x] **P3-24** Change recovered provider and finish-failure resolution so Cost and Speed receive
  only the retry generation atoms and marginal path segments needed for successful recovery.
  Terminal incidents remain Reliability or Outcome endpoints and do not automatically classify the
  failed span's full cost or duration as avoidable.

### Step 5: evaluate, deduplicate, and aggregate

- [x] **P3-25** Implement smooth monotone piecewise evaluation with named healthy, watch, and poor
  ranges. Return raw value, status, penalty in 0 through 1, eligible units, and penalized units. Add
  boundary and monotonicity property tests for every provisional curve.
- [x] **P3-26** Add session-level source-atom arbitration. Exact evidence wins over estimated
  evidence, the same atom can contribute once per family, overlapping metric groups share a cap,
  cross-family derived effects such as cache tokens and modeled savings share a combined cap, and no
  family can exceed its eligible units. One event can still inform different dimensions or distinct
  Cost resources when the units are genuinely different.
- [x] **P3-27** Aggregate each metric by its declared `resourceRatio`, `eventRate`, or `sessionMean`,
  union each family's canonical eligible atoms once, then aggregate the five fixed families with
  weights that never redistribute. Not-applicable units add no penalty; applicable but unreadable
  units lower coverage and can withhold Cost.
- [x] **P3-28** Implement Speed's session counterfactual from marginal critical-path segments. Exact
  segments take precedence over modeled signal effects, concurrent work cannot be counted twice,
  and avoidable time cannot exceed observed critical-path time.
- [x] **P3-29** Represent session estimates with same-unit identification bounds. For project shadow
  results, bootstrap complete sessions and rerun content attribution, deduplication, family
  aggregation, signal correction, and Speed counterfactual per replicate. Never sum item-level lower
  and upper bounds.

### Step 6: integrate signal effects without inflation

- [x] **P3-30** Link signal occurrences to deterministic finding keys and source atoms before fitting
  effects. Linked signals become attribution for an existing family or Speed deficit and add no
  second penalty.
- [x] **P3-31** For unlinked Cost signals, fit family outcomes jointly against corrected clean
  sessions, group near duplicates, use stored inclusion probabilities, cross-fit promotion traffic,
  shrink weak comparisons toward zero, and apply the artifact's total residual cap. Return effect not
  measured when overlap or sample support fails.
- [x] **P3-32** Apply the analogous matched residual estimator to critical-path time for Speed. Keep
  Cost family units and Speed nanoseconds separate throughout estimation and presentation.

### Step 7: update shared use-cases, contracts, and product surfaces

- [x] **P3-33** Extend `read-session-assessment-sources.ts`, `resolve-assessment-findings.ts`,
  `build-dimension-summaries.ts`, and the batch resolver to consume the new facts and shared pure
  evaluators. The single-session operation already uses the bulk path; preserve bit-for-bit
  single/bulk parity and bounded pagination. Replace unbounded per-session resolver concurrency with
  a measured limit and fold project sufficient statistics as batches complete.
- [x] **P3-34** Update the Zod-first session-assessment operation in `@repo/operations`, its mapper,
  descriptions, operation manifest, OpenAPI and MCP schemas, TypeScript and Python SDKs, CLI, and
  in-process tools. Follow the repository's generated-artifact and package-version conventions.
- [x] **P3-35** Extend the session Scores panel with raw Cost metric values and coverage. Place a
  measured adverse amount under attention and a measured zero under positive evidence only when
  coverage is complete. Omit unmeasured and not-applicable metrics from findings; do not add a
  session score, calibrated health labels, or a second dashboard language.
- [ ] **P3-36 (deferred after PR 6)** Extend existing Cost, Tools, Memory, Sessions, and Signals surfaces with their owned
  evidence. Cost shows family health, cache/context evidence, pricing/content coverage, and
  recoverable spend. Tools and Memory show operation evidence. Sessions shows critical paths and
  concrete atoms. Signals uses measured or associated language and links to examples. This does not
  block PR 3 or the initial Agent Score launch because session Scores already expose the evidence.

### Step 8: validate and freeze launch artifacts

- [x] **P3-37** Add a read-only shadow runner that can apply the PR 6 window selection rules to a
  representative thousand-session population without writing score snapshots. Process it in
  deterministic bounded batches and record query count, rows and bytes read, peak memory, resolver
  time, family coverage, score distribution, and rerun determinism.
- [ ] **P3-38 (required before PR 6)** Review every candidate metric against representative shadow
  data for prevalence, discrimination, correlation, applicability, missingness by provider and
  integration, and sensitivity to workload mix. Remove or keep display-only any metric whose
  direction is not defensible, especially raw context utilization, generic zero-hit rate, and
  unproven repeated polling. Record the acceptance decision for every launch metric.
- [ ] **P3-39 (required before PR 6)** Calibrate and freeze the initial project benchmark's family
  weights, piecewise curves, caps, coverage floors, tokenizer bounds, and residual-signal policy.
  Publish the calibration report and artifact version. Later production recalibration requires a
  new scoring version. Session findings continue to show raw measurements without calibrated
  labels.
- [ ] **P3-40 (deferred after PR 6)** Reconcile inspected fixtures across session assessment and Cost, Tools, Memory,
  Sessions, and Signals pages. Confirm that money totals, family units, source atoms, and coverage
  reasons agree even when a dimension is unavailable.

### Exit gate

- [x] Domain tests cover curve boundaries and monotonicity, source-atom arbitration, family caps,
  fixed weights, not-applicable versus unreadable behavior, range semantics, terminal versus
  recovered incidents, and Cost signal residual caps.
- [x] Critical-path tests cover sequential traces, nested spans, concurrent siblings, foreground,
  subagent, background and auxiliary interactions, missing parents, unfinished spans, and exact
  marginal segment attribution.
- [x] Reader tests cover missing content, normalized-message token bounds, tool-result attribution,
  cache prefix mismatch, polling, empty tool and memory fields, expected HTTP statuses, dead-surface
  observation periods, unpriced models, and known free or local models.
- [x] ClickHouse integration tests prove organization/project scope, cutoff behavior, bounded bulk
  reads, memory-event projection, no N-plus-one path, and parity between one-session and batch reads.
- [x] Invariance tests prove duplicate detectors, repeated/thrashing overlap, linked signals, and
  split signal clusters cannot multiply a family or Speed deficit.
- [ ] **Required before PR 6:** shadow runs on representative traffic handle thousands of sessions
  within agreed resource targets, reproduce the same result from the same inputs and artifact, and
  satisfy the recorded metric and calibration acceptance criteria.
- [x] No score snapshot or public Agent Score number ships in PR 3. Existing pages and session
  assessment expose the evidence; PR 6 owns publication.
- [x] `pnpm typecheck` and `pnpm test` pass. Generated contracts and schemas are current.

### Calibration questions to close before the launch artifact is frozen

- What family weights and family caps best preserve sensitivity without letting common tool traffic
  dominate low-tool agents?
- Which healthy/watch/poor curve points are stable across provider, model, agent type, and workload?
- What minimum readable share is required for each family, and which families must be required at
  launch?
- How wide should fallback tokenizer and cadence-only cache identification bounds be after
  reconciliation against provider token totals?
- What maximum Cost penalty can unlinked signals contribute, and how much independent traffic is
  enough to leave effect-not-measured state?

## PR 4: Outcome intelligence

**Product result**: the session Scores panel shows a task-outcome verdict for every judged session,
success under positive evidence and failure under needs attention, with the judge's feedback and
evidence anchor. PR 4 also provides the window estimator and issue inputs that PR 6 needs for a
project Outcome score.

### Scope boundary

The first Outcome score is the selection-corrected success rate among examined, judgeable sessions.
It does not infer a probability for each unexamined session. PR 4 does not train an Outcome model,
add hierarchical signal effects, or change Behaviors. Outcome signals remain project issues and
session evidence, but they do not apply a second deduction on top of task-outcome failures.

PR 4 publishes no score. The estimator and the issue inputs are pure domain use-cases with tests, in
the same position `runCostSpeedShadow` holds after PR 3: no route, no snapshot, no public operation,
no scheduled job.

### What PRs 1 through 3 already built

The consumption side of the task-outcome verdict is already wired. PR 4 supplies the missing producer, the
persistence branch, and the window arithmetic. Do not rebuild these:

| Already in place | Location |
| --- | --- |
| `task-failure` static signal evidence role `outcome/taskOutcome` | `packages/domain/signals/src/score-evidence.ts` |
| `task-failure` reader dimension mapping for coverage | `packages/domain/agent-score/src/resolver/build-assessment-coverage.ts` |
| Score to `taskOutcome` finding with `verdict` from `score.passed` and `metricId: "sessions.task_success"` | `packages/domain/agent-score/src/readers/read-session-assessment-sources.ts` |
| `taskOutcome` effect, positive/negative polarity, high impact level | `packages/domain/agent-score/src/resolver/resolve-assessment-findings.ts` |
| Outcome dimension summary carrying the resolved verdict | `packages/domain/agent-score/src/resolver/build-dimension-summaries.ts` |
| Scores panel rendering of "Task outcome: Succeeded / Failed" in the positive and attention slices | `session-detail-drawer/session-assessment.tsx` |
| `taskOutcome` impact and Outcome summary in OpenAPI, MCP, and both SDKs | `packages/operations/src/openapi/entities/session-assessment.ts` |
| `success`, `failure`, `indeterminate`, `notApplicable` screening outcomes in the enum and the ClickHouse table | `packages/domain/flaggers/src/constants.ts`, migration `00057` |
| Screening coverage mapping: `indeterminate` to `executionFailed`, absent outcome to `pending`, `notApplicable` to not applicable | `packages/domain/flaggers/src/entities/flagger-screening-coverage.ts` |
| Passed annotation scores already rejected by signal discovery | `packages/domain/signals/src/use-cases/check-eligibility.ts` |
| Deterministic no-output already emitting a `taskOutcome: failure` effect | `resolve-assessment-findings.ts` (`terminalOutcomeEffects`) |
| Eligible-session definition, newest-generation decision collapse, inclusion-probability counters in SQL | `packages/platform/db-clickhouse/src/repositories/flagger-coverage-repository.ts` |
| Postgres judgment reads split from ClickHouse telemetry reads for bulk paths | `SessionAssessmentBulkJudgmentSource` in `packages/domain/agent-score/src/ports/session-assessment-sources.ts` |

### Decisions fixed for this PR

- **D1. One uniform sampled stratum.** `task-failure` declares no `hintKinds`. Every readable
  session enters one stratum at the project-configured rate and records `reason: "ordinary-sample"`
  with `inclusionProbability = sampling / 100`. The hint-stratified design in
  [`score.md`](score.md#confidence) and [`flaggers.md`](flaggers.md#screening-decisions) is deferred
  to a later scoring version, for two reasons. Hinted classification is rate limited per
  organization and slug, and a rate-limited hinted session is recorded as selected `false` with
  inclusion probability 1, which drops failure-correlated sessions preferentially and is
  informative missingness the estimator cannot correct. Uniform selection also makes the interval an
  exact binomial rather than a stratified profile likelihood. Both specification documents are
  updated in this PR to match.
- **D2. Deterministic endpoints form a census stratum and dominate the judge.** A session with a
  hard deterministic Outcome endpoint is a certain failure with inclusion probability 1 and is
  removed from the sampled stratum even when the judge also examined it. This keeps the sampled
  stratum a genuine random sample of the sessions it represents, and it satisfies the one-verdict
  invariant: a session that delivered no usable output cannot have succeeded. The launch
  deterministic endpoints are `sessions.no_output` with finding kind `blank` or
  `confirmedUnusablePattern`, and `spans.finish_failure` on the final generation paired with output
  damage. `unconfirmedPattern` is not an endpoint.
- **D3. Task applicability gates the deterministic endpoints.** A deterministic endpoint counts only
  when the session contains a readable user task, defined as at least one non-empty user text
  message in `SessionDetail.inputMessages`. Sessions with no readable task are not applicable and
  lower coverage.
- **D4. The judgment version identifies the judge.** Persisted task-outcome scores carry
  `scoringArtifactVersion = "task-failure-v1:<provider>/<model>"` built from the resolved
  `FLAGGER_CLASSIFIER` generation config, falling back to `task-failure-v1:h:<16 hex>` when the
  readable form exceeds `FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH`. A substituted judge model
  therefore produces a distinct version, as required by the launch artifacts. The estimator takes an
  explicit supported-version list and excludes anything else as a coverage limitation. Freezing that
  list belongs to PR 6.
- **D5. Generation anchoring uses the analysis hash, in Postgres.** The task-outcome score stores
  `analysisHash` in its annotation metadata. The window reader selects the newest decision
  generation per session from ClickHouse and accepts only the score whose `analysisHash` matches it.
  A newest generation that is pending, failed, or indeterminate leaves the session unexamined; the
  reader never falls back to an older generation. No ClickHouse migration is needed: score metadata
  is jsonb, verdicts are read from Postgres through `scores_session_lookup_idx` for the bounded
  decided-session list, and that split already exists for bulk assessment reads. The existing
  ClickHouse `flagger_slug` and `scoring_artifact_version` columns keep working for coverage
  queries.
- **D6. A new slug is inert on existing projects, so it is backfilled.** `screenOneStrategy` drops a
  slug with no `flaggers` row as `missing-flagger`, and rows are only created when a project is
  created, or by an explicit toggle. Without a backfill, Outcome would be permanently unmeasured on
  every project that already exists. PR 4 backfills the row in a Drizzle custom migration, so it
  deploys with the slug that needs it and each future slug carries its own. Two alternatives are
  rejected: a maintenance script, which only works if somebody remembers to run it against every
  environment, and lazy `findOrCreateFlagger` inside screening, which puts a write on the screening
  hot path and needs a cache eviction on every pass for an unprovisioned project.
- **D7. The judge ships enabled at the standard default sampling.** It reuses
  `FLAGGER_DEFAULT_ENABLED` and `FLAGGER_DEFAULT_SAMPLING`. Ten LLM flaggers already sample at 10%
  each, so this is roughly a tenth more flagger spend, not a new order of magnitude. Unlike the
  others it has no deterministic prefilter, so it runs on the whole sampled share. The provisional
  Outcome coverage floor is 100 compatible verdicts and 5% of the eligible base; both numbers are
  calibration candidates frozen in PR 6, not constants buried in a reader.
- **D8. No new session-assessment contract surface.** Incompatible judgment version and insufficient
  examined population are window concerns, not session concerns, so `SessionCoverageLimitation`
  gains no member and the generated contracts do not change shape. Adding the slug still changes the
  public flagger-slug enum, so generated artifacts are regenerated.
- **D9. The flagger is named for the defect it flags, like every other one.** The slug is
  `task-failure` and it displays as "Task failure": the session ended with a material user goal
  unresolved. Naming it for the positive case put a row labelled with the opposite of its finding on
  every triage surface, because the slug and display name flow into Settings, the assessment row,
  the annotation card, the timeline, and the signal drawer. The estimand is unchanged: Outcome is
  still a success rate, the metric is still `sessions.task_success`, and the judge still answers
  `success` or `failure`. Only the detector's name follows the sibling convention.
- **D10. A positive verdict is a measurement, not an annotation.** The passed score has to exist,
  because a rate needs a denominator and a session with no failure may simply be unexamined, sampled
  out, or indeterminate. But nobody wrote it, so it is excluded from the annotation list and the
  positive-annotation count, where it would otherwise appear as a green card and inflate a badge.
  The session assessment still reports it as positive Outcome evidence, which is where it belongs.
  A negative verdict stays a normal annotation: a reviewer does act on it.

### Step 1: the task-outcome verdict contract

- [x] **P4-1** Register the slug. Add `task-failure` to `FLAGGER_STRATEGY_SLUGS`, the strategy
  registry, and `FLAGGER_DISPLAY` with name "Task failure" and `mode: "llm"`. Keep
  `display-sync.test.ts` and `registry.test.ts` green.
- [x] **P4-2** Define the holistic verdict contract in `@domain/flaggers` as a Zod-first
  discriminated union over `success`, `failure`, `indeterminate`, and `notApplicable`, matching
  [`flaggers.md`](flaggers.md#task-failure). `success` and `failure` carry feedback and an optional
  `messageIndex`; the other two carry a reason and never produce a score.
- [x] **P4-3** Build the generation schema per call. Reuse the `messageIndex` enum bound from
  `buildProviderFlaggerOutputSchema`: a Bedrock-constrained decoder runs away on open-ended numeric
  fields, so the index must stay a finite enum of the transcript's real indices. Keep a lenient
  parsing schema separate from the strict generation schema, as the existing flagger output does.
- [x] **P4-4** Write the judge prompt. It asks whether the agent resolved all material user goals
  that remained active at the end of the session, judged holistically rather than per episode. It
  returns `notApplicable` when the transcript contains no user-authored task, and `indeterminate`
  when the evidence cannot support either verdict. Set `classifiesAssistantResponseOnly: false` so
  the judge reads user messages as the source of goals and so nested-sample telemetry is skipped.
- [x] **P4-5** Mark the strategy verdict-shaped and branch `classifyConversationForFlaggerUseCase`
  rather than forking it. Reuse the inspected-agent context, reflag suppression tags, telemetry
  metadata, and the existing mapping of schema mismatch, prompt-too-long, and grammar-compilation
  timeout to `indeterminate`. Run the adversarial annotation review on `failure` only: a success
  verdict has no proposed annotation to sanity check.
- [x] **P4-6** Widen `RunFlaggerResult` and `ClassifySessionFlaggerResult` so a non-negative outcome
  can carry feedback, `messageIndex`, `contentHash`, `latestTraceId`, `simulationId`, and the
  judgment version. The current shapes only carry those fields on the matched branch, so a success
  verdict cannot be persisted through them.
- [x] **P4-7** Set `hasRequiredContext` to require at least one non-empty user text message and at
  least one assistant turn. Declare no `suppressedBy` and no `hintKinds` (D1).
- [x] **P4-7b** Regenerate `apps/api/openapi.json`, `apps/api/mcp.json`, both Fern SDKs, and the
  CLI. The slug is a public enum member, and `api-manifests.yml` fails on drift, so this cannot wait
  for Step 7.
- [x] **P4-7c** Add `task-failure` to every onboarding preset and to a `task-outcome` flagger group
  in `apps/web`. `presets.ts` carries a compile-time exhaustiveness assertion over the slug union,
  and onboarding disables any slug a chosen preset omits, which would have left Outcome unmeasured
  for every project created through onboarding.

### Step 2: persistence, scoring version, and the workflow branch

- [x] **P4-8** Give verdict flaggers their own write path, `upsertFlaggerVerdictScore`, which writes
  `passed: true, value: 1` for success and `passed: false, value: 0` for failure. Built as a
  sibling of `upsertFlaggerAnnotationScore` rather than a `passed`/`value` parameter on it, because
  the two dedup rules are genuinely different and the detection rule is the wrong one here: its
  anchor key deliberately survives re-screens, so a judge citing the same message in two
  generations would make the second verdict look like a duplicate of the first, and a session that
  succeeded, gained turns, and then failed would record only the success. The verdict rule is one
  score per project, session, flagger, and analysis generation. Both paths share one metadata
  builder, and the detection path is untouched.
- [x] **P4-9** Add `analysisHash` to `annotationScoreMetadataSchema` and thread it from the
  screening selection through classification to the written score (D5). It is jsonb, so no Postgres
  migration is required. Written for every flagger score, not only verdicts: the deterministic
  screening match and the sampled annotation save both know their generation, and recording it
  costs one field while making any flagger score traceable to the session content it judged.
- [x] **P4-10** Add the judgment version builder from D4 and a test proving the default judge
  configuration produces a readable version under the 128-character limit and that a different
  resolved model produces a different version.
- [x] **P4-11** Branch `flaggerClassificationWorkflow`. Both scoring verdicts write directly and
  skip the draft step, not only `success` as first planned: a verdict always arrives with its own
  feedback, so the annotator fallback never fires, and the draft step's anchor dedup is the wrong
  rule for a failure for the same reason it is wrong for a success. `indeterminate` and
  `notApplicable` write no score. No `patched()` is required: a replaying execution restores a
  classify result written before `outcome` existed, so the new guard is false and the command
  sequence matches the recorded history.
- [x] **P4-12** Map the terminal screening outcome in `flagger-session-activities.ts` to `success`
  or `failure` for verdict-shaped flaggers instead of the current `matched` or `unmatched`. Keep the
  error path writing `error`.
- [x] **P4-13** Confirm and test that a passed task-outcome score never creates a signal. The
  existing eligibility predicate already rejects passed annotation scores, so this is a regression
  test plus an assertion that a failed verdict does reach `signalDiscoveryWorkflow`.

### Step 3: coverage, provisioning, and selection probabilities

- [x] **P4-14** Verify with tests that the screening decision written before classification carries
  `selected`, `reason: "ordinary-sample"`, and `inclusionProbability = sampling / 100`, and that a
  sampled-out session records the same probability with `selected: false`. This is existing PR 2
  behavior; the tests pin it for the estimator.
- [x] **P4-15** Backfill the `task-failure` row for every live project through the Drizzle custom
  migration from D6, generated with the package migration script. The insert takes its defaults from
  the column definitions and conflicts against the (organization, project, slug) unique index, so it
  is replay-safe and a project that turns the judge off or retunes its sampling keeps that choice.
  Migrations run as the table owner, so row-level security does not block it. The PGlite harness
  applies the real migrations folder, so the SQL is exercised by every Postgres test; a dedicated
  test replays it against seeded projects to prove it inserts what it claims.
- [x] **P4-16** Confirm the Flaggers settings page and its 28-day coverage panel render the new
  flagger, including the case where no decisions exist yet, and that the cached project flagger list
  picks up backfilled rows within its TTL. Both surfaces already iterate `FLAGGER_STRATEGY_SLUGS`
  and fall back to a placeholder row, so no web change is needed. An unprovisioned project renders
  the judge as disabled, which is honest rather than a bug: screening does drop a missing row, so
  the page and the pipeline agree until the backfill runs. The 300-second flagger cache is never
  evicted by the backfill, so provisioned rows take effect within one TTL.

### Step 4: session evidence

- [x] **P4-17** Label flagger-authored score findings with `FLAGGER_DISPLAY[slug].name` instead of
  the raw slug in `readScoreFindings`, so the item reads "Task failure" rather than `task-failure`.
  This improves every flagger row, not only this one.
- [x] **P4-18** Test the session assessment end to end for all four verdicts: success renders under
  positive evidence with the judge's feedback and anchor, failure under needs attention,
  `indeterminate` and `notApplicable` produce no item and appear only through reader coverage, and
  an unexamined session is never a clean result.
- [x] **P4-19** Prove single-session and bulk parity for a session carrying a task-outcome verdict,
  reusing the existing parity fixtures. The existing byte-identical comparison now carries a
  persisted verdict, which is the one assessment input that does not come from telemetry and so the
  one the two paths could most easily disagree on.

- [x] **P4-19b** Rename the detector to `task-failure` / "Task failure" per D9, and keep a positive
  reference verdict out of the annotation list and counts per D10. Done before release, while the
  slug is only in unreleased generated artifacts; the repository already carries one frozen
  mis-slug, `trashing` displayed as "Thrashing", with a do-not-rename warning.

### Step 5: the project Outcome estimator

- [x] **P4-20** Add the numeric primitives the repository does not have: a continued-fraction
  regularized incomplete beta and a Clopper-Pearson exact binomial interval, as pure helpers under
  `@domain/agent-score/src/scoring`. Do not add a runtime dependency for this. Property-test
  monotonicity, coverage at the boundaries, and the zero-failure and zero-success cases, which must
  stay non-degenerate.
- [x] **P4-21** Implement the two-stratum Outcome estimator from
  [`score.md`](score.md#outcome). Stratum A is the deterministic census (weight 1, all failures)
  after applying D2 and D3. Stratum B is the sampled judge population, weighted by
  `1 / inclusionProbability`. The point estimate is
  `100 * sum(weight * success) / sum(weight)` over both strata. The interval transforms stratum B's
  binomial bounds through the pooled ratio, which is monotone, so no naive addition of bounds is
  involved.
- [x] **P4-22** Handle a non-uniform stratum B. When a project changed its sampling rate mid-window,
  group stratum B into sub-strata by distinct inclusion probability, compute each sub-stratum's
  binomial bounds, and combine them into a conservative pooled interval. Record which method
  produced the interval. Exclude any examined session whose inclusion probability is unknown or
  zero, and report it as a coverage limitation rather than dropping it silently.
- [x] **P4-23** Return a result carrying the 0 through 100 rate, the interval and its method, the
  examined count, the eligible count, the deterministic and sampled stratum sizes, the excluded
  counts by reason, and a coverage state of measured or unmeasured with the failing floor named.
  Never return 0, 100, or a midpoint for an unmeasured dimension.
- [x] **P4-24** Add the window source port and its ClickHouse plus Postgres implementation. The
  ClickHouse side reuses the eligible-session definition and the newest-generation collapse already
  written in `flagger-coverage-repository.ts` and returns one row per session with its decision,
  reason, inclusion probability, outcome, and analysis hash. The Postgres side reads the Task
  Success scores for that bounded session list through `scores_session_lookup_idx`. Both reads are
  organization and project scoped and must not be per-session queries.
- [x] **P4-25** Compose the estimator and the sources into a use-case that mirrors
  `runCostSpeedShadow`: deterministic bounded batches, no snapshot write, no public surface. The
  deterministic census arrives as an input rather than being re-read: PR 6's window job already
  resolves that telemetry for the other dimensions, and `selectDeterministicOutcomeFailures` turns
  its normalized inputs into the stratum.

### Step 6: project issue inputs

- [x] **P4-26** Produce bounded Outcome issue inputs from failed task-outcome scores, deterministic
  Outcome findings, and eligible Outcome signal occurrences, using the shared
  `isSignalEligibleForScoring` predicate so ignored and unpromoted signals are excluded.
- [x] **P4-27** Deduplicate shared source evidence before counting. A signal and the score it was
  discovered from are one issue's evidence, not two, and several moments on one session collapse
  into one issue input. Report selection-corrected reach and failed reach alongside the raw examined
  count, which is coverage context and never a ranking key.
- [x] **P4-28** Rank by corrected failed reach. Leave a row unranked and marked when a required joint
  inclusion probability is unknown. Issue counts explain the score; they add no points and never
  claim a fixed recoverable amount. The joint probability multiplies two independent sampling draws
  but collapses to one when the issue rode the verdict's own draw, since a signal discovered from
  the verdict score was selected once, not twice.

### Step 7: contracts, documentation, and regeneration

- [x] **P4-29** Regenerate the generated artifacts affected by the new slug. The public flagger
  enum in `packages/operations/src/operations/projects.ts` is derived from
  `FLAGGER_STRATEGY_SLUGS`, so OpenAPI, MCP, the TypeScript and Python SDKs, and the CLI change even
  though the session-assessment contract does not. Follow the repository's generated-artifact and
  package-version conventions.
- [x] **P4-30** Update [`score.md`](score.md#confidence),
  [`flaggers.md`](flaggers.md#screening-decisions), and [`metrics.md`](metrics.md) so the hint
  stratification described there matches D1, and record the deterministic census stratum, the task
  applicability gate, and the judge-identifying version from D2, D3, and D4.

### Exit gate

- [x] **P4-31** Tests cover every task-outcome verdict, the success path writing a passed score
  without a draft or annotator call, positive-score discovery exclusion, stable selection across
  retries of the same analysis generation, judgment-version compatibility filtering, selection
  correction, zero examined sessions, the coverage floors, deterministic dominance over a
  contradicting judge verdict, issue-ranking correction, unknown joint inclusion probabilities,
  duplicate issue evidence, and single-session versus bulk parity.
- [x] **P4-32** Interval tests prove non-degenerate bounds with zero observed failures and with zero
  observed successes, monotonicity in the observed count, and that a non-uniform stratum B reports
  its method rather than silently using the uniform path.
- [x] **P4-33** Inspected fixtures reconcile the task-outcome score row, its screening decision, the
  session assessment item, the project estimator input, and the issue input without assigning a
  score to the session itself.
- [x] **P4-34** No score snapshot, public Outcome number, route, or scheduled job ships in PR 4.
- [x] `pnpm typecheck` and `pnpm test` pass. Generated API artifacts are current.

### Calibration questions to close before PR 6

- What sampling rate and examined-session floor keep the Outcome interval useful without making the
  judge the dominant flagger cost line?
- Does the holistic session verdict stay stable across re-judgment of the same transcript, and what
  agreement rate against human labels is required before Outcome can publish?
- Which judge configurations belong in the supported-version list, and what happens to a window that
  spans a version change?
- When is the hint-stratified design worth reintroducing, and what rate-limit policy makes its
  missingness ignorable?

## PR 5: Safety assurance

**Product result**: the session Scores panel shows confirmed agent-caused harm and hostile exposure
under needs attention, and successful defense under positive evidence. PR 5 also provides the window
estimator and issue inputs that PR 6 needs for a project Safety score.

### Scope boundary

The launch suite contains Jailbreaking and PII Leakage. NSFW remains contextual unless a later
contract identifies assistant-caused harm. PR 5 does not redesign Flagger Settings or build
standalone Safety analytics on Signal detail.

PR 5 publishes no score. The estimator and the issue inputs are pure domain use-cases with tests, in
the same position `estimateProjectOutcomeWindow` holds after PR 4: no route, no snapshot, no public
operation, no scheduled job.

The work is not the arithmetic. `jailbreaking` and `pii-leakage` today collapse "an attack arrived"
and "the agent misbehaved" into one boolean `matched`, and most matches are attacks the agent
correctly refused. That boolean cannot feed a harmed-session numerator, and two independently
sampled detectors cannot state which sessions the suite examined. PR 5 splits the flat detection
into a structured verdict and makes the examined population knowable, so `q` has a denominator at
all.

### What PRs 1 through 4 already built

Most of Safety's consumption side already exists. PR 5 supplies the structured producer, the
suite-level examined population, and the window arithmetic. Do not rebuild these:

| Already in place | Location |
| --- | --- |
| `safety` dimension with `confirmedHarm`, `exposure`, and `successfulDefense` roles | `packages/domain/shared/src/score-evidence.ts` |
| Static signal evidence roles for `jailbreaking`, `pii-leakage`, and `nsfw` | `packages/domain/signals/src/score-evidence.ts` |
| Safety reader dimension mapping for coverage | `packages/domain/agent-score/src/resolver/build-assessment-coverage.ts` |
| `SessionEvidenceImpact` member `{ kind: "safety", status, findingKind }` | `packages/domain/agent-score/src/entities/session-assessment.ts` |
| Safety dimension summary carrying exposure, defense, and confirmed-harm counts | `packages/domain/agent-score/src/resolver/build-dimension-summaries.ts` |
| Confirmed harm already raising an item to high impact | `resolve-assessment-findings.ts` (`hasHighImpact`) |
| Scores panel rendering "Confirmed harm" and "Successful defenses" | `session-detail-drawer/session-assessment.tsx` |
| Safety impact and Safety summary in OpenAPI, MCP, and both SDKs | `packages/operations/src/openapi/entities/session-assessment.ts` |
| Screening decisions with selection reason, inclusion probability, and generation collapse | `packages/domain/flaggers/src/entities/flagger-screening-decision.ts`, migration `00057` |
| Screening coverage mapping for `notSelected`, `rateLimited`, `pending`, and `executionFailed` | `packages/domain/flaggers/src/entities/flagger-screening-coverage.ts` |
| Verdict-shaped classifier branch: flat Bedrock-safe generation schema, lenient parser, output contract | `packages/domain/flaggers/src/use-cases/run-flagger.ts` |
| Non-negative persisted judgement write path, one score per analysis generation | `upsertFlaggerVerdictScore` in `upsert-flagger-annotation-score.ts` |
| Passed SYSTEM flagger scores excluded from the annotation list in SQL | `omitFlaggerReferenceVerdicts` in `db-postgres/src/repositories/score-repository.ts` |
| Passed scores rejected by signal discovery | `packages/domain/signals/src/use-cases/check-eligibility.ts` |
| `analysisHash` threaded from screening selection to the written score | `annotationScoreMetadataSchema` in `@domain/scores` |
| Clopper-Pearson interval and regularized incomplete beta | `packages/domain/agent-score/src/scoring/binomial-interval.ts` |
| Sub-stratum grouping and pooled bound transform over inclusion probabilities | `packages/domain/agent-score/src/scoring/estimate-outcome.ts` |
| Window source shape: eligible sessions, newest-generation collapse, bounded Postgres score batches | `db-clickhouse/src/repositories/outcome-window-decision-source.ts`, `use-cases/estimate-project-outcome.ts` |
| Issue rows with selection correction, shared-draw joint probability, and unranked rows | `packages/domain/agent-score/src/scoring/build-outcome-issues.ts` |

PR 5 therefore needs no new numeric primitive, no new UI shell, no Postgres migration, and no
flagger provisioning backfill: both launch slugs already exist on every project.

### Decisions fixed for this PR

- **D1. Each finding kind keeps the triage polarity its detector already has.** Structured Safety
  results must not silently re-aim two shipped detectors, so the split decides what enters `q` and
  nothing else. `injectionAttempt` is annotated today and is what the Jailbreaking signal collects,
  so it stays a failed score and only loses the harm claim. `piiExposure` is the opposite: the
  PII prompt explicitly excludes the user's own echoed data today, so recording it as exposure must
  not turn every session whose user typed their own email into an annotation and a signal, and it
  becomes a passed measurement. `injectionDefense` is a passed measurement because the
  specification requires it: a defense is positive session evidence and must not open a signal.
  `injectionCompliance` and `piiDisclosure` stay failed scores and are the only confirmed harm. The
  one accepted regression is that a Jailbreaking signal stops accumulating the attempts the agent
  defended, which were never agent defects.
- **D2. One primary finding kind per session, slug, and analysis generation, resolved by severity.**
  `injectionCompliance` outranks `injectionDefense`, which outranks `injectionAttempt`;
  `piiDisclosure` outranks `piiExposure`. One bounded string therefore carries the result, the
  ClickHouse projection stays one nullable column, and the assessment keeps the specified shape of
  one item with several effects rather than two items describing one event.
- **D3. Suite-level selection replaces two independent draws.** Screening today draws a separate
  sample per slug and checks a separate rate-limit bucket per slug, so the joint examined population
  of two detectors at 10% is 1%, and either member being dropped leaves a session that can never be
  examined after an LLM call was already spent on the other. The suite draws once per session on a
  key that omits the slug, checks one rate-limit bucket, and records the same inclusion probability
  on both members' screening decisions. The suite probability is the minimum sampling across enabled
  members, which is the only value both members actually satisfy. A disabled member makes the suite
  incomplete and leaves Safety unmeasured for that project, which is what the denominator
  definition already requires.
- **D4. The hinted stratum stays, and rate-limited hinted sessions become a named coverage
  limitation.** Outcome removed hints in PR 4 because a rate-limited hinted session records
  `selected: false` with inclusion probability one, which is informative missingness. Safety cannot
  take the same exit: the pattern gatherers are the only affordable prefilter for a rare event, and
  score.md keeps a hinted stratum for Safety deliberately. The hazard is worse here, because hinted
  Safety sessions are exactly the ones that can contain harm, so the estimator counts rate-limited
  hinted sessions explicitly and reports Safety as unmeasured once they exceed a configured share of
  the hinted stratum. Silently dropping them would bias the harm rate downward.
- **D5. Suite completion is judged over applicable members.** `jailbreaking` requires a user
  message and `pii-leakage` requires an assistant message. A session that fails a member's
  `hasRequiredContext` makes that member not applicable rather than the suite incomplete, otherwise
  sessions that could never have been judged would permanently depress coverage.
- **D6. NSFW stays a Safety reader but leaves the examined population.** `FLAGGER_DIMENSIONS` keeps
  mapping `nsfw` to Safety, because unsafe user content is real exposure context on the session
  page. It is not part of the launch suite, so it does not participate in suite completion; leaving
  it in would push every unsampled session's Safety coverage to partial for a detector that cannot
  contribute a harmed session.
- **D7. No new flagger slug.** Both launch detectors are registered, provisioned on every project,
  and public enum members already. The earlier sequencing note that PRs 4 and 5 each add a slug was
  written before the launch suite narrowed to the two existing detectors. The shared additive
  contract with PR 4 is only the widened `RunFlaggerResult` and `ClassifySessionFlaggerResult`,
  which PR 4 has already landed, so PR 5 does not regenerate the public flagger enum and the two
  branches no longer contend over generated artifacts.
- **D8. The judgment version identifies the judge.** Persisted Safety scores carry
  `scoringArtifactVersion = "safety-v1:<provider>/<model>"` built from the resolved
  `FLAGGER_CLASSIFIER` generation config, with the same over-length digest fallback as the
  task-outcome version. A substituted judge model produces a distinct version and the estimator
  treats it as its own population. The shared builder is extracted from
  `taskOutcomeJudgmentVersion` rather than copied.
- **D9. Safety's publication floor is a sample-size floor, not an interval-width floor, and its
  reference run is 100 sessions.** A 1,000-session horizon saturates: on a window that just reaches
  the session target at the default 10% sampling, roughly 100 sessions are examined, and
  `(1 - q) ^ 1000` reads 100 with no harm and approximately 0.004 with one, with nothing in
  between. The horizon is therefore 100 sessions, which is shorter than the score's session target
  on purpose: it is the range over which a readable examined population can actually distinguish
  harm rates. One confirmed failure in 100 examined sessions reads near 37 and one in 1,000 reads
  near 90. The zero-harm 95% lower bound is `100 * 0.05 ^ (100 / examined)`, which is 5 at 100
  examined and 74 at 1,000, so the examined floor and the horizon have to be chosen together.
  Safety still gates on examined population and suite completeness rather than interval width, and
  page.md accepts the wide interval as the honest presentation of a rare event. The floor constants
  ship as `PROVISIONAL_SAFETY_COVERAGE_FLOORS` and are frozen in PR 6.
- **D10. The launch Safety detectors join every onboarding preset.** Onboarding disables every slug
  its chosen preset omits, and four of the seven presets omit both launch detectors. Those projects
  could never complete the suite, so Safety would be permanently unmeasured and the all-five
  publication gate would withhold the entire Agent Score, including the four dimensions that were
  measured. `presets.ts` has a compile-time exhaustiveness assertion over the slug union but not
  over preset membership, so nothing would have caught this. This is the same class of defect as
  PR 4's flagger backfill.

### Step 1: the structured Safety verdict contract

- [x] **P5-1** Define the Safety verdict contract in `@domain/flaggers` as a Zod-first entity beside
  `task-outcome-verdict.ts`. It carries the bounded `SafetyFindingKind` union from
  [`flaggers.md`](flaggers.md#injection-attempt-and-compliance) plus, for jailbreaking, the separate
  attempt, compliance, and compliance-action fields that make the verdict a confirmation rather than
  a category.
- [x] **P5-2** Separate injection attempt from assistant compliance as specified in
  [`flaggers.md`](flaggers.md#injection-attempt-and-compliance). One model call judges both sides.
  `injectionCompliance` requires an attempt, compliance, and the named assistant action.
  `injectionDefense` requires a confirmed attempt and an assistant response that resisted it;
  failing to find compliance is not a defense. Everything else with a confirmed attempt is
  `injectionAttempt`.
- [x] **P5-3** Separate user-authored PII exposure from assistant disclosure. The existing prompt
  already judges assistant output only; the contract now records which side authored the personal
  data, so `piiExposure` and `piiDisclosure` are distinguishable rather than inferred from feedback
  text.
- [x] **P5-4** Build the generation schema per call as a flat object. Bedrock's structured-output
  subset rejects `oneOf`, which is why the task-outcome generation schema is flat with one
  `explanation` slot, and a constrained decoder at temperature zero omits any field the schema lets
  it omit. Reuse the `messageIndex` enum bound from `buildProviderFlaggerOutputSchema` so the anchor
  stays a finite enum of real transcript indices. Keep a lenient parsing schema separate from the
  strict generation schema.
- [x] **P5-5** Widen `strategy.verdictContract` from the single `"taskOutcome"` literal to a union
  and branch `classifyConversationForFlaggerUseCase` on the Safety contract rather than forking it.
  Reuse the inspected-agent context, reflag suppression tags, telemetry metadata, and the existing
  mapping of schema mismatch, prompt-too-long, and grammar-compilation timeout to an unexamined
  result. Run the adversarial annotation review on the finding kinds that still write an annotation;
  a defense proposes no annotation to review.
- [x] **P5-6** Enforce the structural gates in the finding-kind resolver rather than in
  `strategy.validateMatch`, which only sees feedback and a message index and so cannot read the
  structured fields the gates are about. A compliance claim with no named assistant action is
  downgraded to `injectionAttempt`, a defense claim with no confirmed attempt is discarded, and a
  disclosure claim that names nothing disclosed is not harm. Prompt guidance alone cannot guarantee
  any of them, and a model-assigned confirmation without assistant-side evidence is exactly what
  [`signals.md`](signals.md#safety) forbids from entering the numerator.
- [x] **P5-7** Add the Safety judgment version from D8 by extracting the shared builder from
  `taskOutcomeJudgmentVersion`, with a test proving the default judge configuration produces a
  readable version under `FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH` and that a different resolved
  model produces a different version.

### Step 2: persistence and the workflow branch

- [x] **P5-8** Add the bounded finding kind to `annotationScoreMetadataSchema`. It is jsonb, so no
  Postgres migration is required. The kind list itself belongs to `@domain/scores` beside the other
  flagger provenance fields, because the metadata schema cannot depend on `@domain/flaggers` without
  inverting the existing dependency.
- [x] **P5-9** Add one nullable ClickHouse column for the structured finding kind and project it in
  the score analytics repository. Name it generically rather than for Safety, so the next structured
  detector reuses the column instead of adding a sibling. Create the migration only with
  `pnpm --filter @platform/db-clickhouse ch:create`. The migration is forward-only: historical rows
  stay null, which means unknown, never clean or absent-and-therefore-safe. The chdb test schema is
  a dump of the development database, so it needs `ch:up` and `ch:schema:dump` against a running
  ClickHouse to be authoritative.
- [x] **P5-10** Write one Safety score per project, session, flagger, and **finding kind**, as a
  third sibling of the annotation and verdict write paths rather than a reuse of either. Neither
  existing rule fits, which is why the identity is new: the anchor key survives re-screens, so a
  session whose finding escalated from an attempt to a confirmed compliance would keep only the
  attempt, while the verdict's per-generation key would re-write the same jailbreak attempt on every
  re-analysis and duplicate both the card and the signal occurrence. The finding kind is the fact,
  it is monotone within a session, and an escalation is genuinely new information. `analysisHash`
  stays on the score as provenance rather than as the key. Derive `passed` from the finding kind per
  D1, and persist the evidence anchor and selection provenance the existing metadata builder already
  carries.
- [x] **P5-11** Branch the flagger classification workflow so **every** Safety finding writes
  directly and skips the draft step, exposure and confirmed harm included, not only the defense as
  first planned. The judge always returns its own explanation, so the draft step's annotator
  fallback never fires, and its anchor dedup is the wrong identity for all five kinds by P5-10. No
  `patched()` is required: a replaying execution restores a classify result written before
  `safetyFindingKind` existed, so the guard is false and the recorded command sequence still
  matches.
- [x] **P5-12** Map the terminal screening outcome for Safety results so a defense is not recorded
  as `unmatched`. An unexamined session and an examined session with a positive result must stay
  distinguishable in the screening decision, because the estimator reads that field for the examined
  denominator. The existing `success` member carries it: the coverage resolver already treats it as
  examined with a finding, so no screening enum or ClickHouse column changes.
- [x] **P5-13** Confirm and test that a defense score never creates a signal. The existing
  eligibility predicate already rejects passed scores, so this is a regression test plus an
  assertion that a confirmed-harm finding does reach `signalDiscoveryWorkflow`.

### Step 3: suite-level examination

- [x] **P5-14** Declare the launch Safety suite in `@domain/flaggers` as a named constant, and add
  suite-level selection to the screening pass from PR 2. One `deterministicSampling` draw per
  session on a key that omits the slug, so both members share the draw, with the suite inclusion
  probability from D3 recorded on both members' screening decisions. The suite resolves **before**
  any member is screened rather than inside each member's unmatched path, because the rate limit
  below has to answer once and a per-member call cannot.
- [x] **P5-15** Check the suite's rate limit once, in its own bucket, so both members are allowed or
  neither. The per-slug check today can admit one member and drop the other, which spends a model
  call on a session the estimator must then discard as unexamined. Members screen concurrently, so
  two calls against one shared bucket would also consume two tokens and could split on the second.
- [x] **P5-16** Apply the applicability rule from D5 so a member whose `hasRequiredContext` fails is
  not applicable rather than missing, and the suite can still complete. Express it as
  `outcome: "notApplicable"` on the screening decision rather than a new selection reason:
  [`flaggers.md`](flaggers.md#screening-decisions) reserves `skipped` for a policy skip and its
  reason list has no applicability member, so the outcome is where the distinction belongs.
- [x] **P5-17** Verify with tests that the screening decisions written before classification carry
  the shared probability on both members, that a sampled-out session records the same probability
  with `selected: false`, that a hinted session records inclusion probability one, and that a
  retried execution reuses the generation's draw instead of drawing again. Cover the suppression
  hazard the shared selection creates: whether a member was hinted stays that member's own fact, or
  a session hinted only for personal data would make the jailbreaking decision look
  injection-hinted and mute the refusal detector, whose suppressor fires on any hinted classify. A
  member the suite carried along records `uniform-sample`, which is what the vocabulary already
  calls an examination that happened with certainty.

### Step 4: session evidence

- [x] **P5-18** Add a Safety finding to the assessment finding union and produce it from score
  metadata in `readScoreFindings`, branching on the structured finding kind before the existing
  classified-judgment and standalone-score fallbacks, the way the task-outcome verdict already does.
- [x] **P5-19** Resolve the finding into effects, keeping attempt, response, and confirmation as one
  item with several effects. `injectionDefense` carries exposure as context and successful defense
  as positive, and reads as positive evidence. `injectionCompliance` carries exposure as context and
  confirmed harm as an observed, direct negative effect. `injectionAttempt` and `piiExposure` carry
  exposure alone and read under needs attention. `piiDisclosure` carries confirmed harm **alone**:
  third-party data the assistant surfaced never reached the conversation, so there is no exposure to
  pair it with. Only the confirmed-harm effect is `direct`; exposure and defense are `contextOnly`,
  which is what keeps them visible without moving the score.
- [x] **P5-20** Leave the existing model-assigned Safety role mapping untouched. A signal whose
  `confirmedHarm` role came from classification stays not-measured and attribution-only, because
  [`signals.md`](signals.md#safety) requires an assistant-side confirmation field on the occurrence.
  Only the structured finding is observed and direct. Test that the two paths cannot cross.
- [x] **P5-21** Add the exposure count to the Scores panel beside the confirmed-harm and successful
  defense counts it already renders, and prove that an examined session with no Safety finding
  produces no item and appears only through reader coverage. An unexamined session is never a clean
  observation.
- [x] **P5-22** Prove single-session and bulk parity for a session carrying a Safety finding,
  reusing the existing parity fixtures. Like the task-outcome verdict, this is an assessment input
  that does not come from telemetry, so it is one the two paths could most easily disagree on.

### Step 5: the project Safety estimator

- [x] **P5-23** Extract the sub-stratum grouping and pooled bound transform from the Outcome
  estimator into a shared helper under `@domain/agent-score/src/scoring`, and have both dimensions
  call it. The arithmetic is dimension-agnostic, and PR 6 composes both; two copies would drift.
- [x] **P5-24** Implement the examined population, confirmed-harm union, selection correction, and
  coverage gates defined in [`score.md`](score.md#safety). Several detectors on one session produce
  one harmed session. A session counts as examined only when every applicable launch detector
  completed in the same analysis generation.
- [x] **P5-25** Implement Safety interval and reference-run estimation as a reusable domain result.
  The Clopper-Pearson bounds on the harm count transform through the monotone decreasing
  `(1 - q) ^ 100` map, so the upper bound on `q` produces the lower bound on Safety. Keep the
  interval non-degenerate with zero observed harms.
- [x] **P5-26** Return a result carrying the 0 through 100 score, the interval and its method, the
  examined count, the harmed count, the eligible count, the excluded counts by reason including
  rate-limited hinted sessions from D4, and a coverage state of measured or unmeasured with the
  failing floor named. Never return 0, 100, or a midpoint for an unmeasured dimension. The
  provisional examined floor is **1,000** rather than Outcome's 100, because the transform in P5-25
  needs a population to resolve against: the zero-harm lower bound is
  `100 * 0.05 ^ (referenceRun / examined)`, which is 5 at a hundred examined sessions and 74 at a
  thousand.
- [x] **P5-27** Add the Safety window source port with its ClickHouse and Postgres implementation.
  The ClickHouse side reuses the eligible-session definition and the newest-generation collapse from
  the Outcome window source and reads both launch slugs, collapsing **per member** rather than
  forcing one generation across the suite: a session whose members answered in different generations
  then arrives with two analysis hashes and the estimator can reject it as incomplete, instead of
  the query silently pooling halves of two runs. The Postgres side reads the Safety scores for that
  bounded session list through `scores_session_lookup_idx`. Both reads are organization and project
  scoped and must not be per-session queries.
- [x] **P5-28** Compose the estimator and the sources into a use-case that mirrors
  `estimateProjectOutcomeWindow`: deterministic bounded batches, no snapshot write, no public
  surface.

### Step 6: project issue inputs

- [x] **P5-29** Generalize the Outcome issue builder into one shared issue-row builder over a named
  adverse axis, and produce Safety rows from confirmed-harm findings and eligible Safety signal
  occurrences through the shared `isSignalEligibleForScoring` predicate. The two builders differ
  only in which session predicate counts, so a second copy would be 150 duplicated lines of
  selection-correction arithmetic. Outcome adopts the neutral vocabulary rather than keeping its own
  behind a translation layer, so PR 6 reads one set of row fields for both dimensions. Safety
  returns **two** tables, because the page lists confirmed harm separately from exposure: a session
  the agent harmed lands in the harm table only, which is what makes the second one exposure-only
  rather than a double count.
- [x] **P5-30** Union harm once per session and deduplicate shared source evidence before counting.
  A signal and the score it was discovered from are one issue's evidence, not two. Report
  selection-corrected exposure reach and harmed reach alongside the raw examined counts, which are
  coverage context and never a ranking key.
- [x] **P5-31** Rank by corrected harmed reach, and leave a row unranked and marked when a required
  joint inclusion probability is unknown. The joint probability collapses to one draw for every
  Safety observation, not just a signal discovered from the harm score: the finding and the
  session's harm status both come from the one suite selection, so multiplying them would square a
  probability that was rolled once. Exposure rows rank by harmed reach too, so an attack that
  sometimes succeeds outranks a more common one that never does. Issue counts explain the score;
  they add no points and claim no recoverable amount.

### Step 7: contracts, presets, and documentation

- [x] **P5-32** Extend the session-assessment operation and generated contracts only as needed for
  the new Safety items and coverage. `findingKind` **stays a free string** rather than being bounded
  to the launch enum as first planned: two vocabularies already share the field, because an item
  derived from a signal's model-assigned role puts that signal's detector slug through it, and
  narrowing the enum would either break that path or change the behaviour P5-20 deliberately froze.
  The description names the launch kinds instead. No slug or enum changed in PR 5, so the public
  flagger surface is untouched and the only regeneration is that description reaching OpenAPI, MCP,
  both SDKs, and the CLI. Defer Flagger Settings and standalone Signal-detail analytics until after
  the initial Agent Score launch.
- [x] **P5-33** Add both launch Safety detectors to every onboarding preset per D10, and add a test
  asserting that every preset enables the full launch suite, so a future preset cannot silently
  withhold the whole Agent Score.
- [x] **P5-34** Update [`flaggers.md`](flaggers.md#screening-decisions) and
  [`score.md`](score.md#safety) to record suite-level selection, the suite inclusion probability,
  the applicability rule, the rate-limited hinted coverage limitation, and the sample-size
  publication floor from D3, D4, D5, and D9.

### Exit gate

- [x] **P5-35** Tests prove that exposure never enters confirmed harm and unexamined sessions never
  become clean observations. Passed defense findings do not enter signal discovery. Sampled issue
  rows rank by corrected harm reach rather than raw overlap.
- [x] **P5-36** Fixtures cover refused and complied-with injections, user and assistant PII,
  multiple detectors on one harmed session, a suite with one member rate-limited, a suite with one
  member not applicable, a suite with one member disabled, and incomplete coverage.
- [x] **P5-37** Interval tests prove non-degenerate bounds with zero observed harms, monotonicity in
  the observed harm count, correct direction through the reference-run transform, and that a
  non-uniform examined population reports its method rather than silently using the uniform path.
- [x] **P5-38** Inspected fixtures reconcile the structured finding, its screening decisions across
  both suite members, the session assessment item, the project estimator input, and the issue input
  without assigning a score to the session itself.
- [x] **P5-39** No score snapshot, public Safety number, route, or scheduled job ships in PR 5.
- [ ] `pnpm typecheck` and `pnpm test` pass. Generated API artifacts are current.

### Calibration questions to close before PR 6

- What suite sampling rate and examined-session floor make Safety measurable without turning the
  two-call suite into the dominant flagger cost line? The reference-run transform needs an examined
  population in the thousands before the point estimate stops being effectively binary, which points
  at near-census examination on the projects that can afford it.
- Is Agent Score deliberately a high-traffic-project feature? At the 100-session horizon a clean
  window reaches a lower bound of 74 once a thousand sessions are examined, so the question is now
  whether projects reach that examined population at the chosen suite sampling rate, not whether the
  formula can express the result.
- What share of rate-limited hinted sessions makes the hinted stratum's missingness ignorable, and
  what is the right policy when it is exceeded?
- Does the structured jailbreaking verdict agree with human review on compliance often enough to be
  the confirmation contract without a second reviewer, and does it stay stable across re-judgment of
  the same transcript?
- Which judge configurations belong in the supported-version list, and what happens to a window that
  spans a version change?

## Requirements before PR 6

PR 6 starts only when all of these gates pass:

- [ ] Every promoted signal has stable evidence roles or is explicitly diagnostic.
- [ ] Session assessment resolves the same source facts in single-session and bulk mode.
- [ ] Structured findings distinguish recovery, terminal failure, exposure, defense, and harm.
- [ ] Sampled evidence has a known examined population or remains unmeasured.
- [ ] Cost family metrics, curves, weights, caps, coverage floors, and residual-signal policy have an
  audited, calibrated, and frozen initial artifact backed by representative shadow data. Production
  recalibration and cross-surface expansion are later follow-ups.
- [ ] Cost native impacts and Speed counterfactuals are bounded and visible on existing pages.
- [ ] Outcome uses compatible sampled task-outcome verdicts with known inclusion probabilities and
  passes its examined-population coverage floor. The provisioning migration has deployed, so the
  slug is not silently inert on projects that predate it.
- [ ] Safety uses a full-window examined population and confirmed-harm definition. The complete
  launch suite is selected once per session with a known inclusion probability, every onboarding
  preset enables it, and the sample-size floor is large enough that the reference-run transform
  produces a point estimate between its endpoints.
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
- [ ] **P6-2** Implement all five window estimators by composing bulk session evidence and the frozen
  Cost scoring artifact. Do not add metric-specific arithmetic outside the PR 3 catalog and
  evaluators.
- [ ] **P6-3** Implement complete-session bootstrap intervals, boundary-aware endpoint intervals,
  the all-five-dimensions publication gate, the fixed composite, optional policy cap, and
  scoring-version boundaries from [`score.md`](score.md).
- [ ] **P6-4** Implement dynamic cause rows from
  [`score.md`](score.md#dynamic-attribution-after-scoring). Use attributed deficit, fix gain,
  residual, and bounded Shapley approximation where a counterfactual supports them. Outcome and
  Safety use their smaller selection-corrected issue-overlap contracts.

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
