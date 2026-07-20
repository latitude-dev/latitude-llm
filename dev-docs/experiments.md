# Experiments

An **Experiment** is a project-scoped container that compares two or more **Variants** against one **baseline**, across every analytic Latitude computes for sessions, users, tools, signals, and behaviours. It answers: *how do these slices of my data differ from each other?*

Experiments are deliberately close to [monitors](./monitors.md) — project-scoped, org-RLS'd, slug-referable, soft-deleted, name + description, embedded JSON config, list + detail pages, and a full HTTP/MCP/SDK/CLI surface. The differences: an Experiment owns an **array of Variants** (embedded, no child table) instead of one target + rule, and it computes **comparison analytics on read** rather than evaluating a rule on a schedule. There are no incidents, no jobs, no domain events.

Experiments live in `@domain/experiments`. The population-scoped metrics engine (`VariantMetricsReader`) is the one genuinely new backend piece.

Related docs:

- [monitors.md](./monitors.md) — the entity this mirrors.
- [filters.md](./filters.md) — the `FilterSet` DSL a Variant carries.
- [agent-data-access.md](./agent-data-access.md) — the analytics query surface the reader builds on.

## Model

An Experiment has `name`, `description`, a `slug` (unique per project among non-deleted rows), and an ordered `variants` array. A **Variant** groups the three things that together select a population:

- `id` — a stable cuid, so rename / set-baseline / remove operations key off identity, not array position.
- `name` — positional default `"Variant A" | "Variant B" | …` (user-editable, unique within the experiment).
- `baseline` — a boolean flag; **exactly one** Variant is `true` when the array is non-empty. The baseline lives on the Variant, not on the experiment (no `baselineVariantId`).
- `filterSet` — a `FilterSet` (`@domain/shared`), authored in **sessions** filter mode.
- `query` — a free-text / semantic search string (max 500).
- `timeRange` — a `VariantTimeRange`: `{ type: "relative", seconds }` (live, recomputed on read), `{ type: "absolute", fromIso, toIso }` (fixed), or `null` (the default last-30-days window).

**Population grain is sessions.** A Variant's population is the set of `session_id`s matching its `filterSet` + resolved range + `query`; child entities (tools/signals/behaviours) are scoped by `session_id ∈ population`.

Key constants (`@domain/experiments/src/constants.ts`): `MAX_VARIANTS_PER_EXPERIMENT = 10`, `DEFAULT_VARIANT_RANGE_SECONDS = 30d`, `EXPERIMENT_NAME_MAX_LENGTH`/`VARIANT_NAME_MAX_LENGTH = 128`, `VARIANT_QUERY_MAX_LENGTH = 500`, `TOP_LIST_LIMIT = 5`, `DEVIATION_METRIC_KEYS = ["sessions.count", "sessions.users"]`, `POPULATION_DEVIATION_THRESHOLD = 0.25`.

### Invariant enforcement

`experimentSchema` (`superRefine`) checks structural invariants on every read: unique variant ids, and exactly one baseline iff the array is non-empty. **Variant-name uniqueness is a write-time rule** (`duplicateVariantName`, surfaced as a `ValidationError` in the create/update use-cases), not a schema rule, so legacy rows with duplicate names still parse on read. Pure helpers in `helpers.ts` keep the array consistent: `newVariant` (baseline iff the list was empty), `withBaseline` (single-baseline on set-baseline), `ensureBaseline` (promote the first when the baseline is removed), `firstAvailableVariantName`/`nextDefaultVariantName` (gap-filling names). There is **no `errors.ts`** — the package reuses `@domain/shared` errors.

## Data model

Postgres table `experiments` in the `latitude` schema (`packages/platform/db-postgres/src/schema/experiments.ts`): `id`, `organization_id`, `project_id`, `slug`, `name`, `description`, `variants jsonb`, `deleted_at`, timestamps. Org RLS policy + explicit `organizationId` filter in every query (defense in depth), partial-unique `(project_id, slug) WHERE deleted_at IS NULL`, and `(organization_id, project_id) WHERE deleted_at IS NULL`. No FKs (repo convention), no `system`/`muted_at` columns.

Variants are **embedded** (JSONB array), not a child table: they are few, always co-read/written with their experiment, and never queried across experiments — matching `monitors.config`. The `toExperiment` / `toExperimentRow` mappers live in `ExperimentRepositoryLive` and `experimentSchema.parse(...)` on read so invariants hold.

**"Import from search" snapshots** a saved search's `filterSet` + `query` into a Variant at import time. There is no stored reference to the saved search, so there is no saved-search-deletion cascade.

## Metrics and comparison

### `VariantMetricsReader`

Port in `@domain/experiments/src/ports/variant-metrics-reader.ts`; Live adapter in `packages/platform/db-clickhouse/src/repositories/variant-metrics-repository.ts`. Two methods:

- `computeVariantMetrics(input)` → `VariantMetrics` for one Variant.
- `computeSummaryMetrics(input)` → `{ sessionsDistinct, usersDistinct }` over the OR-union of several Variant populations (the cheap list columns).

**Population scoping** builds the inner query once by reusing the sessions analytics stream (`streamFor("sessions").buildInner({ filterSet, range, query })`), then scopes each child-entity query by that population **as a server-side subquery** — `session_id IN (SELECT session_id FROM (<inner>))` — on top of an org/project scope. The population is never pulled into Node: at 100M+ session rows a broad Variant matches tens of millions of ids, so round-tripping them as an `Array(String)` param would OOM the API. `IN (SELECT session_id FROM (<inner>))` binds to the single projected column; nesting the multi-column inner directly (`IN (<inner>)`) silently binds to its first column (`organization_id`) and matches nothing — that mistake, not the correct single-column form, is what produced the historical `ILLEGAL_AGGREGATION`/empty-result confusion. Sessions + users metrics read straight off the inner (`FROM (<inner>)`), which already **is** the population's per-session rollup, so they don't re-scan `sessions`. The ~10 metric queries (`execute_tool` spans, `scores`, `taxonomy_observations FINAL`, `session_semantic_moments FINAL`, plus the two rollup reads) run **bounded** at `METRIC_QUERY_CONCURRENCY`, and the comparison use-case runs Variants at `VARIANT_METRIC_CONCURRENCY`, so a single read can never exceed `VARIANT_METRIC_CONCURRENCY * METRIC_QUERY_CONCURRENCY` in-flight queries against the process-shared ClickHouse pool. Every query carries per-query guards (`max_execution_time`, `max_memory_usage`) so a pathological population fails its own request instead of the server-wide OvercommitTracker. `computeSummaryMetrics` is the list-column exception: it `UNION ALL`s each population's namespaced inner (projecting only `session_id, user_id`) and takes a single `uniqExact`/`uniqExactIf`, bounded across experiments at `SUMMARY_METRIC_CONCURRENCY`.

> **Not yet cached.** Metrics recompute on every read. The highest-leverage next step for the "hundreds of concurrent viewers" case is a cache-aside layer (Redis is already on the operations context) keyed by `org:${organizationId}:experiment-comparison:${experimentId}:${updatedAt}:${rangeBucket}`, bucketing relative-range `now` to a coarse boundary and using a short TTL so ongoing ingestion stays roughly visible. Deferred as a separate change because its staleness/invalidation contract is a product decision.

`VariantMetrics` = `{ values: Record<ExperimentMetricKey, number | null>, topTools, topSignals, topBehaviours }`. `values` is a **flat** map keyed by the namespaced `<entity>.<metric>` catalog key (unit is read from the `EXPERIMENT_METRICS` catalog, not stored per value). Each `TopListItem = { key, label, value }` is produced with **`key` and `label` both set to the raw id** — display names are resolved at the web/API boundary (see below).

**Semantic queries are best-effort.** The reader applies the query via the sessions search plan (lexical exact; a semantic component is a ranked sample), so a Variant with a semantic query is flagged `approximate`. The reader requires only `ChSqlClient` — it does not embed queries.

### The catalog and directionality

`EXPERIMENT_METRICS` (a `@domain/experiments` constant) encodes `key` / `label` / `entity` / `unit` / `direction` per metric — the codebase has no intrinsic good/bad flag, so we define one: `up-good` (↑ green), `down-good` (↓ green), `neutral` (~, no color). The catalog is the single source shared by the reader (units) and the web (color + label). `HEADLINE_METRIC_KEYS` are the four large panels: `sessions.count`, `sessions.users`, `sessions.cost_total`, `sessions.duration_median`.

`getExperimentComparisonUseCase` computes `VariantMetrics` for every Variant, then for each non-baseline Variant attaches a per-key `delta = (v - b) / b` (`"up-from-zero"` when `b === 0` and `v > 0`; `null` when incomparable), and flags `deviatingPopulationKeys` (a subset of `sessions.count` / `sessions.users`) that deviate from the baseline by more than `POPULATION_DEVIATION_THRESHOLD`. Deviation is computed from raw populations, so an empty-vs-non-empty pair is flagged symmetrically. The baseline carries no delta.

## Web

Server functions in `apps/web/src/domains/experiments/experiments.functions.ts` (7): `listExperiments` (rows carry the summary columns), `getExperimentBySlug`, `getExperimentComparison`, `searchExperimentsOrgWide`, `createExperiment`, `updateExperiment`, `deleteExperiment`. **Variant mutations are client-side** (`useExperimentVariantActions` in `experiments.collection.ts`): each derives the next `variants` array via the domain helpers and calls `updateExperiment`, so invariants are enforced server-side. Both the web and the API converge on `updateExperimentUseCase` — the shared write seam.

`getExperimentComparison` wraps the use-case in `withResolvedTopListLabels`, a best-effort step that batch-resolves the reader's raw signal/cluster ids to display names (`SignalRepository.findByIds` / `TaxonomyClusterRepository.listByIds`); a lookup failure falls back to raw-id labels rather than failing the request.

The **detail page renders a table** (`comparison-table.tsx`), not cards: one supercolumn per Variant (baseline first), columns dividing the available width equally (floor 320px, overflow past that). The baseline column is sticky-left with a stuck shadow while scrolled, and its header/editors/summaries rows are wrapped by the `@repo/ui` `AnimatedBorder` shader ring (per-corner radii, hidden while scrolled). Shared rows: variant header, population editors (`DateRangePicker` + segmented `SearchInput` + the reusable `FilterBuilder`), headline panels, then a full-span collapsible header row per metric entity with one aligned row per metric beneath. `metric-format.tsx` holds `formatMetricValue` (compact cost, min/h/d durations, trailing-zero strip) and `MetricDelta` (sub-0.1% deltas hidden). Metric sections start expanded and toggle in lockstep across all supercolumns.

Command palette: `use-experiment-search-commands.ts` (org-wide name search) + the `experiment:create` context command from the list page. Nav entry in `project-sections.ts` (`FlaskConical`, `understand` group) auto-wires the sidebar item and navigation command.

## API / SDK / MCP / CLI

`packages/operations/src/operations/experiments.ts` mounts `/projects/:projectSlug/experiments` with five operations, all sharing the domain use-cases:

| Op | Method | sdkMethod | access | tier |
| --- | --- | --- | --- | --- |
| `listExperiments` | GET `/` | `list` | read-only | medium |
| `createExperiment` | POST `/` | `create` | write | medium |
| `getExperiment` | GET `/{experimentSlug}` | `get` | read-only | high |
| `updateExperiment` | PUT `/{experimentSlug}` | `update` | destructive | medium |
| `deleteExperiment` | DELETE `/{experimentSlug}` | `delete` | destructive | medium |

`getExperiment` returns the full comparison bundle (per-Variant metrics + deltas + deviation flags), resolving top-list names in the operation layer, and fans out ClickHouse per Variant (hence `high`). `listExperiments` attaches the cheap `variantCount` / `sessionsDistinct` / `usersDistinct` summary columns. Response schemas + mappers live in `packages/operations/src/openapi/entities/experiment.ts`. `listExperiments`/`getExperiment` (read-only, execute-form) auto-join `readOnlyToolset`.

Regenerate on surface changes: `pnpm openapi:emit && pnpm mcp:emit && pnpm generate:all`, and bump the SDK versions + add a `packages/cli/CHANGELOG.md` entry (the CLI has no manifest).

## Operational invariants

- **RLS + explicit org filter** in every repository query; slug scope is per project among non-deleted rows.
- **No `ProjectDeleted` cascade** (matches monitors) — a soft-deleted project simply hides its experiments.
- **No saved-search cascade** — Variants snapshot filters at import.
- **Metrics computed on read** (detail + `GET /{slug}`); the list gets only the two cheap summary columns. No scheduled job.
- **Cache keys**, if ever added, use the org prefix `org:${organizationId}:experiment:…`.
