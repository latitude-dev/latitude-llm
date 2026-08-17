# Taxonomy assignment coverage — Datadog setup

The fit floor (`TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD`) buys precision by refusing
assignments, so its cost is a **coverage drop**. Every garden run emits that cost
as the APM span `taxonomy.gardenTaxonomyWorkflow.assignmentCoverage` (service
`workflows`), carrying the project's window coverage plus the run's own
assigned/rejected counts.

Like the quality spans and unlike `…shadow`, this one is **not flag-gated**: it
fires for every project in every mode, which is the point — the projects running
`off` are the ones that isolate the online gate.

Application logs go to CloudWatch, not Datadog, so spans are the read path. As
always, renaming the span orphans its retention filter, its span metrics and the
dashboard widgets at once, silently.

## Do this before the fit-floor deploy

Retention filters and span metrics are not retroactive. `setup-datadog.sh`
converges these objects alongside the adaptive-rollout and tree-quality ones, so
one run sets up all three:

```
DD_APP_KEY=xxx DD_API_KEY=yyy ./apps/workflows/datadog/setup-datadog.sh
```

Then move the `Taxonomy assignment coverage spans` filter **above** any broad
`service:workflows` or catch-all filter (APM → Retention Filters). Filters are
evaluated top-down and the first match decides; the script cannot set ordering.

The dashboard widgets live in the **tree-quality** dashboard
(`taxonomy-quality-dashboard.json`, group "Assignment coverage"), not a dashboard
of their own: that is the dashboard whose spans already cover every mode, so the
template variables and scope tags match.

## The "before" does not come from Datadog

Span metrics only start accruing when the span first fires, so shipping the
telemetry with the threshold change means Datadog's first data point is already
post-change for the adaptive arm. That is fine, because the exact baseline comes
from ClickHouse instead:

```
LAT_CLICKHOUSE_URL=… LAT_CLICKHOUSE_USER=… LAT_CLICKHOUSE_PASSWORD=… \
  pnpm --filter @app/workers exec tsx \
  scripts/taxonomy/snapshot-assignment-baseline.ts taxonomy-assignment-baseline.json
```

Run it **before the deploy** and commit the output. `taxonomy_observations` is
retained for 30 days, so the rows recording what the old floor admitted are
destroyed by retention, not by the deploy — there is no querying them later. The
snapshot is counts and confidence quantiles per (organization, project, method):
no embeddings, summaries or session ids, which is why it is committable where
`pull-fresh-pilot.ts` output is not.

Its `wouldRejectAtFloor` column is the **per-project prediction** — the share of
currently-assigned observations below the new floor. Checking `assigned_share`
against it project by project is the actual verification; a fleet-wide 13% says
nothing about which projects paid it.

## The two arms are two treatments, not control and test

`routed_full_window` is the grouping that matters, and it is the plan's **shape**,
not its mode — an enforced run that fell back to static takes the sample-only
path, so grouping by mode would pool two treatments.

| arm | what moved it | shape of the change |
| --- | --- | --- |
| `routed_full_window:0` (sample-only, most projects) | the online gate only, and only for sessions analyzed since the last pass | **ramps** down over ~7 days as the window turns over; the first post-deploy spans are approximately the baseline |
| `routed_full_window:1` (full-window routing, adaptive) | the online gate **and** the reassignment floor, re-gating the whole window every pass | **steps** on the first pass |

So a gap between the arms is a difference in treatment, not evidence about the
clustering mode. `fit_floor` is also a grouping tag, so a later recalibration is
separable from a traffic change on the same chart.

## Interpreting the metrics

| Metric | What it is | Good | Bad / watch |
| --- | --- | --- | --- |
| `assigned_share` | Assigned ÷ total over the trailing gardening window | Settling a few points below its pre-deploy level, near that project's `wouldRejectAtFloor` | Falling far past the prediction → the floor is stricter in practice than birth confidences implied (they are the best-fitting population by construction, so the floor is expected to be somewhat optimistic) |
| `observations_rejected` / `observations_reassigned` | This run's writes only | Rejections a stable fraction of the pass | Rejections rising pass over pass on a project whose window is stable → the tree is drifting away from its own members |
| `window_total` | Observations in the window | Context | Read coverage against it: a coverage move on a collapsing window is a traffic change, not a floor effect |
| `window_noise` | Unassigned rows in the window | Tracks the drop | Approaching `window_total` on one project → its tree stopped accepting anything; check whether its build collapsed (`topLevelRowCount` on the quality spans) |

Coverage is a distribution over the trailing 7-day window, not a per-run health
signal like `fallbacks`, so the same caveat as both other dashboards applies: one
week for the window to turn over, two to confirm the level holds.

## What is deliberately not here

Per-cluster coverage. Deriving shares from a window of assignments mixes the
current tree with historical `centroid_online` assignments to now-deprecated
clusters — measured at 0.22 vs 0.54 and 0.45 vs 0.87 on two projects. Anything
cluster-scoped must first filter to a single `reassignment_run_id`. Project-level
assigned-vs-noise coverage is free of that bias, which is why it is what the span
carries.

View (cohort/facet) coverage is also absent: the view slices have their own
coverage concept (`TAXONOMY_LENS_COVERAGE_*`), and reading the global observation
table for a scoped run would report the project's number under the behavior's name.
The per-run `observations_rejected` count does cover the scoped path.
