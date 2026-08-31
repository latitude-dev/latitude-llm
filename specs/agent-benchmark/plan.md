# Plan

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

This is the only progress tracker for the Agent score. The other documents describe the design and do
not carry tasks.

Each phase maps to one pull request. Phases 1, 2 and 3 have no dependency on each other and can run
in parallel. Phase 3 sits early because two Speed metrics cannot be measured without it, and because
the aggregation job does not need the score to exist.

| Phase | Depends on |
| --- | --- |
| 0. Remove the mocked page | none |
| 1. Flagger correctness and enablement | none |
| 2. Signal dimensions | none |
| 3. Fleet baselines | none |
| 4. Metric readers | 1 |
| 5. The score engine | 2, 4 |
| 6. Attribution | 5 |
| 7. The page | 5, 6 |
| 8. Calibration | 3, 5 |

---

## Phase 0 - Remove the mocked page

The mocked Agent Score page implements the first version of this design: three Apdex dimensions plus a
separate efficiency section. That shape is gone, so the mock misleads anyone who opens it.

- [x] **P0-1**: Delete `apps/web/src/routes/_authenticated/projects/$projectSlug/score/`, which is
  `index.tsx` plus its components and tests. No file outside the directory imports any of them.
- [x] **P0-2**: Remove the `score` entry from `PROJECT_SECTIONS` in
  `apps/web/src/domains/projects/project-sections.ts`, and drop the now-unused `GaugeIcon` import.

**Exit gate**:

- `apps/web/src/routeTree.gen.ts` regenerates without the score route. It is generated from the file
  tree, so it must not be hand-edited.
- `pnpm --filter @app/web typecheck` passes.
- Knip reports no export left unused by the deletion.

---

## Phase 1 - Flagger correctness and enablement

Three fixes and two additions. The fixes improve signals customers already see, independent of the
score. Details in [`flaggers.md`](flaggers.md).

- [ ] **P1-1**: Add a hash of the tool output to the `trashing` signature, and skip calls whose
  captured arguments are empty. Polling repeats arguments by design, and absent arguments make every
  consecutive call to one tool collide.
- [ ] **P1-2**: Add the finish-reason classifier to `@domain/spans`, sorting every value into clean,
  unreliable or unmapped. Expose `finishReasons` on the span field registry so users can filter to
  them from the cause list.
- [ ] **P1-3**: Require two signals for truncation. An unreliable finish reason of `length` or
  `max_tokens` marks a session ruined only when `output-schema-validation` also reports damaged
  output. Content filters and malformed function calls need no second signal.
- [ ] **P1-4**: Store flagger screening decisions: organization, project, session, flagger slug,
  decision, reason, timestamp. `summarizeDecisions` currently reduces them to a log line.
- [ ] **P1-5**: Add a `flagger_slug` column to the ClickHouse `scores` table and backfill it from the
  Postgres `scores.metadata` field.
- [ ] **P1-6**: Extend the `jailbreaking` verdict with a compliance field, so a successful injection
  is separable from an attempted one.
- [ ] **P1-7**: Add a status count to the session analysis reader, which offers only a latest-row
  lookup and an upsert today.

**Exit gate**:

- The classifier has a table-driven test covering every value in
  [`metrics.md`](metrics.md#spansfinish_ruined), plus uppercase and unmapped cases.
- `finishReasons` filters correctly under the existing analytics tests.
- A test proves `trashing` does not match a polling sequence, meaning identical arguments with
  differing outputs, and does not match when arguments are absent.
- Screening decisions are queryable per project, per flagger and per window.
- `flagger_slug` is populated for every historical flagger-authored score.

---

## Phase 2 - Signal dimensions

Details in [`signals.md`](signals.md).

- [ ] **P2-1**: Add the dimension list to the signal row, the entity schema and the public API shape.
  Cap the list at two entries.
- [ ] **P2-2**: Add the static flagger table and resolve the list from the dominant flagger slug,
  using `ScoreRepository.listFlaggerSlugsBySignalId`.
- [ ] **P2-3**: Add the dimension list to the schema in `generate-signal-details.ts` for signals with
  no dominant slug. Write it at promotion only.
- [ ] **P2-4**: Backfill existing promoted signals. The static table first, then a model pass for the
  annotation-origin tail.
- [ ] **P2-5**: Scope signal metrics in `variant-metrics-repository.ts` to promoted signals. The
  current `signal_id != ''` predicate counts candidates that were never promoted.

**Exit gate**:

- Every promoted signal in a seeded project carries a dimension list.
- A test proves `refreshSignalDetailsUseCase` does not change an existing list.
- A test proves a user-origin signal is excluded from the eligible set.
- `signals.affected_sessions_rate` no longer counts unpromoted candidates, with a regression test.

---

## Phase 3 - Fleet baselines

Details in [`metrics.md`](metrics.md#fleet-baselines).

- [ ] **P3-1**: Build the aggregation job. Group spans by provider, model, input token bucket and
  streaming mode. Emit percentiles and a sample count per cohort. The output carries no tenant
  attribution.
- [ ] **P3-2**: Extract two control points per cohort, good at the fleet median and poor at the fleet
  95th percentile, and freeze them into an artifact the scoring version pins.
- [ ] **P3-3**: Implement the gates and the fallback chain: provider and model and bucket, then
  provider and model, then not measured. Never fall back to one line across all models.

**Exit gate**:

- A self-hosted instance with no fleet data scores identically to one with it, because the control
  points ship in the code.
- A cohort below its sample gate returns not measured rather than a percentile.
- The job's output contains no organization or project identifier.
- Decide which of `model` and `response_model` is the more stable key across the fleet, and record the
  answer.

---

## Phase 4 - Metric readers

One reader per entity group in [`metrics.md`](metrics.md). Each returns per-session severity for a
session metric, or a raw value for a ratio or baseline metric.

- [ ] **P4-1**: Session and span readers: `sessions.no_output`, `spans.finish_ruined`,
  `spans.finish_degraded`, `spans.provider_error`.
- [ ] **P4-2**: Tool readers: `tools.call_failed`, `tools.structural_defect`, `tools.repeated_call`,
  `tools.thrashing`, `tools.dead_surface`. Exclude the undeclared-tool finding kind from
  `tools.structural_defect`.
- [ ] **P4-3**: Memory readers at session grain: `memory.repeated_zero_hit`, `memory.noop_rewrite`,
  `memory.reverted_write`. The existing analytics are store-scoped and grouped by record and trace.
- [ ] **P4-4**: Cost reader: `cost.cache_gap`, reusing the achievable rate the Cost dashboard already
  computes.
- [ ] **P4-5**: Moment readers: `moments.strong_failure`, `moments.failed_self_service`,
  `moments.weak_failure`. The paired condition orders moments by message index.
- [ ] **P4-6**: Signal reader: `signals.hit`, taking the eligible signal id set from Postgres.
- [ ] **P4-7**: Safety reader: `safety.confirmed_failure`, counting distinct confirmed failure types.
- [ ] **P4-8**: Baseline readers: `spans.ttft` and `spans.throughput`, mapping the project value
  between its cohort's frozen control points.

**Exit gate**:

- Every metric has a fixture test asserting its guard. Empty tool arguments, empty content hash and
  empty query text each produce no match.
- `tools.repeated_call` does not match a polling sequence.
- A project with no memory activity, no tools, or no analyzed conversations returns not measured for
  the affected metrics rather than a clean reading.
- The span pass covers repeated calls, structural defects and finish reasons in one scan.

---

## Phase 5 - The score engine

Details in [`score.md`](score.md).

- [ ] **P5-1**: Eligible session resolution, including the simulation exclusion, and the window steps
  over 7, 14, 21 and 28 days targeting 1000 sessions, with hysteresis at each boundary.
- [ ] **P5-2**: Dimension scores. Union the session metrics, combine with the ratio and baseline
  losses, and apply per-term weights.
- [ ] **P5-3**: The Safety penalty model, deducting per distinct confirmed failure type from a
  starting score of 100, plus the composite cap at 80 when any confirmed failure exists.
- [ ] **P5-4**: The composite, the dimension weights, the applicability floors and the weight
  redistribution.
- [ ] **P5-5**: Confidence inputs and the Wilson interval. The interval is always displayed and there
  is no provisional badge, because the floor of 200 already bounds it.
- [ ] **P5-6**: The snapshot table, the daily job and `scoring_version`.

**Exit gate**:

- The score computes end to end for a seeded project against known fixtures.
- Dimension deficits sum to exactly `100 - score`, asserted in a test.
- A session found by two metrics inside one dimension is counted once, asserted in a test.
- A metric in two dimensions lowers both, asserted in a test.
- Re-running the daily job for the same date is a no-op.
- A project below 200 eligible sessions returns collecting rather than a number, and still returns its
  cause list.
- The window picks 7, 14, 21 or 28 days correctly at each boundary, and hysteresis stops a project
  near a boundary from alternating.
- The breakdown renders from the stored row with no live re-query.

---

## Phase 6 - Attribution

- [ ] **P6-1**: Per-session cause masks per dimension, and the grouped query that returns one row per
  mask and severity.
- [ ] **P6-2**: Share and gain per cause, derived from the mask table in application code.
- [ ] **P6-3**: The top-k union, computed directly rather than by summing gains.
- [ ] **P6-4**: Mechanical recommendations per cause, and the evidence-backed panel for signals using
  `aggregateDimensionBySignal`.

**Exit gate**:

- Per-cause shares sum to exactly their dimension's loss, asserted in a test.
- Individual gains sum to less than the dimension's loss, and the remainder equals the overlap.
- The top-k preview matches a score recomputed with those causes removed, asserted in a test.
- The mask table is bounded regardless of project size.

---

## Phase 7 - The page

Details in [`page.md`](page.md).

- [ ] **P7-1**: The score, the interval, the window, and the five dimension scores. The shown-not-
  scored figures beside them.
- [ ] **P7-2**: One section per dimension with its causes ranked by gain, carrying severity,
  sessions, points, cost, trend and destination.
- [ ] **P7-3**: Destination links to Sessions, Tools, Memory, Cost, Signals and Behaviors.
- [ ] **P7-4**: The top-k preview, which must respect the safety cap rather than promising points the
  cap will not release.
- [ ] **P7-5**: The Safety panel, showing counts and exposure rather than a rate.
- [ ] **P7-6**: The daily trend chart, marking scoring version changes and window length changes.
- [ ] **P7-7**: Re-add the sidebar entry in `project-sections.ts`, first in the Observe group.

**Exit gate**:

- Every lost point links to the sessions that lost it.
- A dimension that was not measured renders the reason, not a blank and not 100.
- No surface renders a defect percentage or a safety percentage.
- The collecting state renders the full cause list.

---

## Phase 8 - Calibration

- [ ] **P8-1**: Run the score in shadow across the fleet for two weeks.
- [ ] **P8-2**: Validate the dimension weights against the shadow data. They start at Outcome 0.35,
  Reliability 0.25, Cost 0.15, Speed 0.15, Safety 0.10. Optionally fit them against human annotation
  verdicts, accepting that annotation coverage is self-selected.
- [ ] **P8-3**: Set the Safety deduction per confirmed failure type. The cap at 80 carries most of the
  weight, so the deduction can be moderate.
- [ ] **P8-4**: Compute the fleet control points for `spans.ttft` and `spans.throughput`, and publish
  the method. Decide what counts as a shift large enough to recompute them.

**Exit gate**:

- No weight or control point in the code is a judgement call without a recorded figure behind it.
- The scoring version is stamped and the method is published.
