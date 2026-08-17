# Taxonomy tree quality — Datadog setup

Every garden run emits two APM spans from the `workflows` service:

| span (`resource_name`) | emitted by | carries |
| --- | --- | --- |
| `taxonomy.gardenTaxonomyWorkflow.buildQuality` | the planning activity, off the tree the run persists | `largestLeafShare`, `leafSizes`, `topLevelRowCount`, `largestTopLevelShare`, per-leaf `centeredCohesion` (p10/p50/p90 + min) |
| `taxonomy.gardenTaxonomyWorkflow.nameQuality` | the assert-quality activity, after naming | `duplicateNameRate`, `crossBranchDuplicateLeafCount`, `sharedSiblingWordShare`, `nearDuplicateNameRate` |

Unlike `taxonomy.gardenTaxonomyWorkflow.shadow`, **neither is flag-gated**: they
fire for every project, every view, in every clustering mode, which is the point —
a baseline that excluded the projects running `off` would be a baseline for nobody.
Budget for roughly two spans per garden run; the flag-gated shadow span alone runs
~5k/week, so expect these to land somewhat above that each.

Application logs go to CloudWatch, not Datadog, so spans are the read path.

## Do this before the Build 4 deploy, and before Builds 1–3 land

Retention filters and span metrics are **not retroactive**. Build 4 exists so that
de-nesting, sibling merging and contrastive naming have a measured before/after; if
these objects are created after those builds ship, there is no "before" and the
whole enabler is wasted. Order:

1. `DD_APP_KEY=xxx DD_API_KEY=yyy ./apps/workflows/datadog/setup-datadog.sh` —
   creates the `Taxonomy quality spans` retention filter and the `taxonomy.quality.*`
   span metrics (alongside the adaptive-rollout objects it already managed).
   Idempotent: every object is deleted and recreated, so re-running repairs drift.
2. Nothing to reorder by hand — the script promotes every taxonomy filter above the
   rest of the account on each run. Filters are evaluated top-down and the first match
   decides, so a broad filter above these would sample the quality spans out before
   they are indexed; and since recreating a filter by name gives it a new id at the
   bottom, the order has to be re-asserted on every run rather than dragged once.
3. Apply `taxonomy-quality-dashboard.json` with the Datadog MCP
   `upsert_datadog_dashboard`.
4. Deploy Build 4, then confirm in Trace Explorer:
   `service:workflows resource_name:taxonomy.gardenTaxonomyWorkflow.buildQuality`.
   Gardening runs ~6-hourly per project, so the first spans land within hours.
5. Let it accrue **before** merging Builds 1–3.

The keys' role needs `apm_retention_filter_write` and `apm_generate_metrics`; a key
without them returns 403.

## The two channels, and why both exist

**Retention filter (15 days).** Keeps 100% of the quality spans so a single run is
readable per project in Trace Explorer. This is the only way to read `leafSizes` —
it is a comma-joined string tag, not a number, so it cannot become a metric, and
the sorted vector (`1302,52,43,38,18,16,16,15`) is what makes a regression legible
at a glance.

**Span metrics (15 months).** Generated at ingestion, so they accrue independently
of what the retention filter indexes and outlive the 15-day span window. This is
the channel that carries the before/after across builds that land weeks apart. The
script generates distributions (with percentiles) grouped by project, organization,
custom behavior and facet:

`largest_leaf_share`, `largest_top_level_share`, `top_level_row_count`,
`leaf_count`, `members_clustered`, `centered_cohesion_min`, `centered_cohesion_p50`,
`duplicate_name_rate`, `cross_branch_duplicates`, `shared_sibling_word_share`,
`near_duplicate_name_rate`.

## Interpreting the dashboard

| Metric | What it is | Good | Bad / watch |
| --- | --- | --- | --- |
| `largestLeafShare` | Biggest leaf ÷ members in the build's own partition | Below ~0.4 | Above 0.5 — one group swallows the project and the tree is unreadable. Measured on the fleet: 16 of 29 projects had a single cluster holding a majority, 3 resolved to a single cluster |
| `largestTopLevelShare` | Same, over the promoted top-level rows | Tracks `largestLeafShare` | Diverging from it means the concentration is in a parent, not a leaf |
| `topLevelRowCount` | Rows after content-free interiors are promoted away | 4–17 | **Falling** after a change is the failure mode to catch (see below). Above ~30 is the width case the row cap exists for; the widest tree measured in production yields 17 |
| `leafSizes` | Sorted leaf-size vector (span tag, Trace Explorer only) | A gradual profile | A long head and a flat tail — `[1302, 52, 43, …]` is one residue plus noise |
| `centeredCohesion` min / p50 | Per-leaf cohesion on corpus-mean-centered vectors | Above ~0.45 | Below ~0.35 is residue. **Raw cohesion cannot see this** — it spans 0.85–0.94 for residue and genuine leaves alike, because the corpus-wide shared component inflates both. Rank on the minimum: an 88-session leaf measured ~58% one job plus a 42% unrelated tail, and mid-range cohesion did not certify it |
| `duplicateNameRate` | Leaves colliding with any other leaf **anywhere** in the tree | 0 | Non-zero. The shipped quality gate only compares siblings, so cross-branch collisions ship silently |
| `crossBranchDuplicateLeafCount` | The subset the gate cannot see | 0 | Any. Observed twice in one tree |
| `sharedSiblingWordShare` | Share of leaf-name words every sibling also uses | Below ~0.4 | Above ~0.6 — the namer described the shared domain instead of the split. On the best-separated partition available, 90% of leaf-name words came from vocabulary true of every session |
| `nearDuplicateNameRate` | Share of leaf-name pairs, anywhere in the tree, scoring ≥ 0.5 Jaccard over segmented tokens | 0 | Any pair, and a rise after a naming change. This is the acceptance test for contrastive naming: exact collisions are its tail, and two names one word apart read as duplicates on the screen |

### The one pairing that matters

`largestLeafShare` and `topLevelRowCount` share a chart because reading either
alone has already produced a wrong conclusion. One tested change improved
`largestLeafShare` 62% → 49% while cutting top-level rows 3 → 2 and burying the
newly-coherent groups two levels down: better on the tracked metric, worse for the
customer. Treat a fall in row count as a regression even when concentration
improves.

### `topLevelRowCount` is not correct until de-nesting ships

It is computed against the **promoted** row list — root unwrapped, content-free
interiors replaced by their children — which is what the Behaviours screen will
render once the de-nesting read lands. Until then the screen still shows the root's
literal children (`topLevelClustersBuilt`, on the adaptive span), so the two
disagree by design.

A second consequence: the divisive builder routes every member to a leaf, so no
freshly-built interior holds anything and `topLevelRowCount` currently always
equals `leafCount`. That is a fact about today's builder, not the definition —
interior residue is a display-path phenomenon, from online routing stopping at an
interior between rebuilds.

### Reading a trend needs ~2 weeks

Same caveat as the adaptive dashboard: gardening runs every ~6h but each run
clusters a sample from the trailing 7-day window, so consecutive runs share nearly
all their input. One week for the window to turn over, two to confirm a shape holds
across more than one turnover. Cross-branch duplicates are the exception — a single
run is enough to see one.

### Not on this dashboard

`leafSizes` (string tag — Trace Explorer), and any query over live
`assigned_cluster_id`. Deriving these shares from a window of assignments mixes the
current tree with historical `centroid_online` assignments to deprecated clusters
and biases them badly: two projects measured both ways came out 0.22 vs **0.54**
and 0.45 vs **0.87**. Anything added later must scope to a single
`reassignment_run_id`.
