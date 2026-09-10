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

PRs 4 and 5 can run in parallel after PR 3. They share a small additive structured-flagger-result
contract, so the second branch to merge must rebase before regenerating shared API artifacts.

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

### Step 8: calibrate at project scale and freeze launch artifacts

- [x] **P3-37** Add a read-only shadow runner that can apply the PR 6 window selection rules to a
  representative thousand-session population without writing score snapshots. Process it in
  deterministic bounded batches and record query count, rows and bytes read, peak memory, resolver
  time, family coverage, score distribution, and rerun determinism.
- [ ] **P3-38 (deferred after PR 6)** Review every candidate metric for prevalence, discrimination, correlation,
  applicability, missingness by provider and integration, and sensitivity to workload mix. Remove
  or keep display-only any metric whose direction is not defensible, especially raw context
  utilization, generic zero-hit rate, and unproven repeated polling.
- [ ] **P3-39 (deferred after PR 6)** Recalibrate the project benchmark's family weights, piecewise curves, caps,
  coverage floors, tokenizer bounds, and residual-signal policy. Publish the calibration report and
  a new artifact version. PR 6 may launch with the versioned initial artifact; any later change to
  these values requires a scoring-version boundary. Session findings continue to show raw
  measurements without calibrated labels.
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
- [ ] **Deferred after PR 6:** shadow runs on representative production traffic handle thousands of
  sessions within agreed resource targets and reproduce the same result from the same inputs and
  artifact.
- [x] No score snapshot or public Agent Score number ships in PR 3. Existing pages and session
  assessment expose the evidence; PR 6 owns publication.
- [x] `pnpm typecheck` and `pnpm test` pass. Generated contracts and schemas are current.

### Calibration questions that remain open until shadow data

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

**Product result**: the session Scores panel shows successful Task Success judgments under positive
evidence and failed judgments under needs attention. PR 4 also provides the window estimator and
issue inputs that PR 6 needs for a project Outcome score.

### Scope boundary

The first Outcome score is the selection-corrected success rate among examined, judgeable sessions.
It does not infer a probability for each unexamined session. PR 4 does not train an Outcome model,
add hierarchical signal effects, or change Behaviors. Outcome signals remain project issues and
session evidence, but they do not apply a second deduction on top of Task Success failures.

### Task Success flagger

- [ ] **P4-1** Add the configurable `task-success` LLM-as-judge flagger and holistic verdict contract
  from [`flaggers.md`](flaggers.md#task-success).
- [ ] **P4-2** Extend the flagger workflow to persist passed scores for success, failed scores for
  failure, and coverage-only decisions for indeterminate and not-applicable results. Store the
  judgment version and inclusion probability used for each decision.
- [ ] **P4-3** Publish failed Task Success scores to normal signal discovery while preventing passed
  scores from creating signals.
- [ ] **P4-4** Store selection probabilities before classification and preserve hinted, sampled,
  skipped, rate-limited, and errored outcomes.

### Session and project evidence

- [ ] **P4-5** Add Task Success judgments to the shared session-assessment sources and resolver.
  Render success under positive evidence and failure under needs attention with the judgment's
  feedback and evidence anchor. Omit indeterminate and not-applicable decisions from both lists and
  expose them through coverage.
- [ ] **P4-6** Add the selection-corrected project Outcome estimator from
  [`score.md`](score.md#outcome). Return the 0 through 100 success rate, interval, examined count,
  eligible count, and coverage state without publishing an Agent Score snapshot.
- [ ] **P4-7** Produce bounded project issue inputs from failed Task Success scores, deterministic
  Outcome findings, and eligible Outcome signal occurrences. Deduplicate shared source evidence and
  report affected sessions and overlap with examined failures. Issue counts explain the score but
  do not create extra points.
- [ ] **P4-8** Extend the session-assessment operation, generated contracts, and Scores UI only as
  needed for the new Outcome items and coverage. Defer Behaviors and standalone Signal-detail
  analytics until after the initial Agent Score launch.

### Exit gate

- [ ] **P4-9** Tests cover every Task Success verdict, positive-score discovery exclusion, stable
  selection, version compatibility, selection correction, zero examined sessions, coverage floors,
  duplicate issue evidence, and single-session versus bulk parity.
- [ ] **P4-10** Inspected fixtures reconcile the Task Success score row, session assessment item,
  project estimator input, and issue input without assigning a score to the session itself.
- [ ] `pnpm typecheck` and `pnpm test` pass.

## PR 5: Safety assurance

**Product result**: the session Scores panel shows confirmed agent-caused harm and hostile exposure
under needs attention, and successful defense under positive evidence. PR 5 also provides the window
estimator and issue inputs that PR 6 needs for a project Safety score.

### Scope boundary

The launch suite contains Jailbreaking and PII Leakage. NSFW remains contextual unless a later
contract identifies assistant-caused harm. PR 5 does not redesign Flagger Settings or build
standalone Safety analytics on Signal detail.

### Safety findings

- [ ] **P5-1** Separate injection attempt from assistant compliance as specified in
  [`flaggers.md`](flaggers.md#injection-attempt-and-compliance).
- [ ] **P5-2** Separate user-authored PII exposure from assistant disclosure.
- [ ] **P5-3** Persist a bounded structured finding kind, judgment version, evidence anchor, and
  selection provenance through score metadata and the ClickHouse projection. Historical rows remain
  unknown. Passed defense findings must not enter signal discovery.

### Examination and estimation

- [ ] **P5-4** Add suite-level Safety selection on the screening infrastructure from PR 2. Selected
  sessions run Jailbreaking and PII Leakage with one stored inclusion probability.
- [ ] **P5-5** Implement the examined population, confirmed-harm union, selection correction, and
  coverage gates defined in [`score.md`](score.md#safety).
- [ ] **P5-6** Implement Safety interval and reference-run estimation as a reusable domain result.
- [ ] **P5-7** Keep exposure outside confirmed-harm arithmetic and report successful defense as
  positive session evidence. Treat the structured jailbreaking verdict as confirmation when it
  includes the assistant action that complied.

### Session and project evidence

- [ ] **P5-8** Add Safety findings and examination coverage to session assessment. Render confirmed
  harm and exposure under needs attention, successful defense under positive evidence, and never
  treat an examined session with no finding as positive evidence.
- [ ] **P5-9** Produce bounded project issue inputs from confirmed-harm findings and eligible Safety
  signal occurrences. Union harm once per session, deduplicate shared source evidence, and report
  exposure separately. Issue counts explain the score but do not create extra points.
- [ ] **P5-10** Extend the session-assessment operation, generated contracts, and Scores UI only as
  needed for the new Safety items and coverage. Defer Flagger Settings and standalone Signal-detail
  analytics until after the initial Agent Score launch.

### Exit gate

- [ ] **P5-11** Tests prove that exposure never enters confirmed harm and unexamined sessions never
  become clean observations. Passed defense findings do not enter signal discovery.
- [ ] **P5-12** Fixtures cover refused and complied-with injections, user and assistant PII, multiple
  detectors on one harmed session, and incomplete coverage.
- [ ] **P5-13** Inspected fixtures reconcile the structured finding, session assessment item,
  project estimator input, and issue input without assigning a score to the session itself.
- [ ] `pnpm typecheck` and `pnpm test` pass.

## Requirements before PR 6

PR 6 starts only when all of these gates pass:

- [ ] Every promoted signal has stable evidence roles or is explicitly diagnostic.
- [ ] Session assessment resolves the same source facts in single-session and bulk mode.
- [ ] Structured findings distinguish recovery, terminal failure, exposure, defense, and harm.
- [ ] Sampled evidence has a known examined population or remains unmeasured.
- [ ] Cost family metrics, curves, weights, caps, coverage floors, and residual-signal policy have a
  versioned initial artifact. Production recalibration and cross-surface expansion are deferred
  follow-ups.
- [ ] Cost native impacts and Speed counterfactuals are bounded and visible on existing pages.
- [ ] Outcome uses compatible sampled Task Success verdicts with known inclusion probabilities and
  passes its examined-population coverage floor.
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
- [ ] **P6-2** Implement all five window estimators by composing bulk session evidence and the frozen
  Cost scoring artifact. Do not add metric-specific arithmetic outside the PR 3 catalog and
  evaluators.
- [ ] **P6-3** Implement complete-session bootstrap intervals, boundary-aware endpoint intervals,
  the all-five-dimensions publication gate, the fixed composite, optional policy cap, and
  scoring-version boundaries from [`score.md`](score.md).
- [ ] **P6-4** Implement dynamic cause rows from
  [`score.md`](score.md#dynamic-attribution-after-scoring). Use attributed deficit, fix gain,
  residual, and bounded Shapley approximation where a counterfactual supports them. Outcome and
  Safety use their smaller issue-overlap contracts.

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
