# Taxonomy adaptive shadow — Datadog setup

The shadow comparison is emitted as attributes on the APM span
`taxonomy.gardenTaxonomyWorkflow.shadow` (service `workflows`). Application logs
go to CloudWatch, not Datadog, so the read path is APM spans. Do these **before**
enabling shadow in prod (`LAT_TAXONOMY_ADAPTIVE_CLUSTERING_MODE=shadow`), since
retention filters and span metrics are not retroactive.

Site: `datadoghq.eu`. All calls need `DD-API-KEY` + `DD-APPLICATION-KEY` headers,
and the keys' role must carry the RBAC permissions for each write: the retention
filter needs `apm_retention_filter_write`, the span metrics need
`apm_generate_metrics`. A key without them returns 403.

## Gate 1 — ingestion (mostly handled in code)

The OTel SDK samples AlwaysOn, so the app exports 100% of spans to the DD agent.
The activity also sets `manual.keep` on the span, which tells the trace agent to
keep the low-volume garden trace chunk at ingestion. If agent-side sampling still
drops them, pin ingestion with an Ingestion Control rule (APM → Settings →
Ingestion Controls) keeping `service:workflows` at 100%.

## Gate 2 — retention filter (indexes ingested spans for 15 days)

`setup-datadog.sh` creates a 100%-keep retention filter over
`operation_name:taxonomy.gardenTaxonomyWorkflow.shadow`
(`POST .../apm/config/retention-filters`; exact body in the script). It keeps
100% of the shadow spans, searchable/aggregatable in Trace Explorer and the
spans-source dashboard for 15 days.

Retention filters are evaluated **top-down**, and the first match makes the
keep/drop decision — a broader filter above this one could sample the shadow
spans out before it runs. After running the script, make sure this filter sits
**above** any broad `service:workflows` / catch-all filter (APM → Retention
Filters, drag to reorder, or the `retention-filters-execution-order` API); the
script can't set ordering.

## Durable history — span-based metrics (retained 15 months)

Indexed spans expire after 15 days; the decision window is ~1–2 weeks, so
`setup-datadog.sh` also generates span-based metrics
(`POST .../apm/config/metrics`) for durable, cheap aggregation: distributions
(percentiles) of the shadow shape counts, ARI, deltas, durations, peak RSS, and
relative-separation p50, plus a `count` metric for fallbacks — all grouped by
`@taxonomy.projectId` / `@taxonomy.organizationId` / `@taxonomy.customBehaviorId`.
The exact metric list and payloads live in the script (the single source of
truth), so the dashboard can read `data_source: metrics` for history beyond the
15-day span window.

## Interpreting the dashboard

Every widget reads the `taxonomy.gardenTaxonomyWorkflow.shadow` span; one span
per garden run per project. Shadow **persists the static (production) tree** — so
`adaptive.*` and `diff.*` describe the tree that *would* be built, never what
users see. The whole point is the `static` vs `adaptive` contrast per project.

The tree is a hidden depth-0 root over `rootChildCount` top-level clusters; the
production bug is that the fixed 0.85 sibling-cosine gate collapses some projects
to ~1 root child, and node-relative adaptive should recover the real intents.

| Metric (attribute) | What it is | Good | Bad / watch |
| --- | --- | --- | --- |
| `static.rootChildCount` vs `adaptive.rootChildCount` | Top-level clusters each builder puts under the root | Pilot/collapsed projects: static ≈ 1, adaptive **3–5**. Already-separated broad projects: the two roughly **agree** | Adaptive ≫ static *everywhere* (over-splitting), or adaptive ≈ static on a collapsed pilot (adaptive isn't fixing anything) |
| `diff.rootChildDelta` (adaptive − static) | Net change in top-level cluster count | Small **positive** where static collapsed, ~**0** where static was already fine, and **steady** run-to-run | Large positive across all projects (fragmentation); oscillating run-to-run (instability) |
| `diff.partitionAri` | Adjusted Rand Index of the two leaf partitions on the shared sample: **1 = identical**, ~0 = unrelated | **< 1** on projects static gets wrong (adaptive reorganized them); **near 1** where static was already good (no needless churn); **stable** per project | ≈ 1 on the pilot (collapse *not* fixed); ≈ 0 everywhere (adaptive reshuffles even good taxonomies); jumps between runs |
| `relativeSeparation.p50` (+ p10/p90) | How far accepted splits clear the node-relative gate (threshold 0.45 at root → 0.65 deep) | Comfortably **above** the depth threshold — accepted splits are genuinely separated | Hugging the threshold → marginal, fragile splits a small schedule change would flip |
| `rejectionReason.*` counts (undersizedChild / dominantChild / lowScore / lowRelativeSeparation) | Why candidate splits were rejected — the "explain every collapse" layer | Mixed/low; a collapse is explainable by the reason that dominates | `lowRelativeSeparation` dominating a project you *expect* to split → the separation gate is the binding constraint (possibly too strict); `dominantChild` → one child hogging the parent |
| `adaptiveDurationMs` vs `staticDurationMs` | Per-build wall-clock | Adaptive within **~25%** of static (the calibrated ceiling) | Adaptive ≳ 2× static → perf regression / calibration issue |
| `peakRssBytes` (max) | Process RSS around the build | Comfortably **under** the worker limit (512 MB old-gen heap) | Approaching it → OOM risk, which itself trips a `buildError` fallback |
| `fallbacks` (`fallbackReason:*` count) | Runs that fell back to static: `nonFinite` / `structuralLimit` / `buildError` | **0** | Any. `nonFinite`/`structuralLimit` = a builder correctness bug; frequent `buildError` = worker instability. This is the primary "is adaptive safe to enforce" gate |
| `observationsSampled` | Sample size feeding the build (min 15, cap 1,500) | Context only | Near 15 → thin sample; treat that project's row with lower confidence |
| `mode`, `policyVersion` | Slicing dimensions | `mode` = `shadow` fleet-wide this phase; `policyVersion` separates calibrations | A stray `enforced`/`off` row means the env baseline/flag isn't what you think |

**The pilot verdict** (Phase-5 go/no-go) reads as: the pilot project's row shows
`static.rootChildCount` ≈ 1 and `adaptive.rootChildCount` **3–5**, `diff.partitionAri`
sits below 1 and is **stable** across ≥2 turnovers, `fallbacks` is **0**,
`adaptiveDurationMs` is within ~25% of static, and `peakRssBytes` stays under the
worker limit — with every collapsed node on any project explainable from its
`rejectionReason` mix. If all hold, adaptive is safe to enforce for that org.

## Why the read needs ~2 weeks

Garden sweeps run every ~6h, but each run clusters a sample drawn from the
**trailing 7-day** window, so consecutive runs share almost their entire input
and are highly correlated — a dozen runs in a day is close to one independent
data point, not a dozen. The first `shadow` event lands ~6–11h after enabling
it, which is enough to confirm the pipeline, but not to judge the algorithm:

- **~1 week (minimum)** for the 7-day window to fully turn over, so a later run
  is a genuinely fresh sample rather than a re-clustering of the same traces.
- **~2 weeks** to confirm the root-child delta and partition ARI **hold across
  more than one turnover** — i.e. the adaptive shape is stable, not an artifact
  of one week's traffic mix.

So read the per-project trend of `@diff.rootChildDelta` / ARI over that span,
not a single run. Fix the exact shadow duration as a calibrated Phase-1 value.

## How long / when to stop

~2 weeks is the defensible **minimum**, not a target to always exceed. Running
longer has real but **diminishing** value, and shadow costs ~2× clustering
compute fleet-wide for the whole duration, so bound it deliberately. Shadow never
changes production (it persists static), so the only cost of extending is that
compute — there is no correctness risk.

**Keep running while** any of these hold:

- the per-project `@diff.rootChildDelta` / ARI are still moving (not yet flat
  across ≥2 window turnovers);
- the project hasn't yet been observed across a representative traffic period —
  a full weekly cycle, a campaign, or month/quarter-end for bursty or seasonal
  projects (e.g. the ads-analytics pilot), where a fortnight may be one regime;
- `@taxonomy.adaptive.fallbackReason` fallbacks or guardrail anomalies are rare
  and you want more evidence they don't spike.

**Stop once** the delta/ARI are stable across ≥2 turnovers **and** a
representative traffic period has been covered. Past that, extra weeks are
near-duplicate evidence (consecutive 7-day windows overlap) — pay the 2× only
while it's still teaching you something.

## Order of operations

1. Run `setup-datadog.sh` (retention filter + span metrics), then reorder the
   filter to the top per Gate 2.
2. Release the Phase-4 code to prod, then `pulumi up` to set
   `LAT_TAXONOMY_ADAPTIVE_CLUSTERING_MODE=shadow` (never the var before the code).
3. Trigger a garden run (or wait ~6h) → confirm spans via Trace Explorer:
   `service:workflows operation_name:taxonomy.gardenTaxonomyWorkflow.shadow`.
4. Apply `taxonomy-shadow-comparison-dashboard.json` with `upsert_datadog_dashboard`.
