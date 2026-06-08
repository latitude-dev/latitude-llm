# Taxonomy Lineage Continuity Matcher

> **Status**: Idea
> **Related documentation**: [`dev-docs/taxonomy.md`](../dev-docs/taxonomy.md), [`packages/domain/taxonomy/src/use-cases/build-hierarchical-taxonomy.ts`](../packages/domain/taxonomy/src/use-cases/build-hierarchical-taxonomy.ts)

## Goal

Make taxonomy cluster ids **stable across gardening passes** so the UI can show real time-series trends ("Order Returns volume is up 18% this week") instead of seeing every cluster reset every 6 hours.

## Why This Matters Now

The current `buildHierarchicalTaxonomyUseCase` is a clean rebuild on every pass:

1. Sample the live window.
2. Build a fresh tree top-down via spherical k-means.
3. Generate new cuids for every cluster, save them.
4. Deprecate every previously-active cluster that wasn't re-emitted (which is **all of them**, because cuids are random).
5. Emit `birth` lineage for the new clusters and `death` lineage for the old ones.

This is correct and idempotent, but it has a sharp consequence:

- The `taxonomy_clusters.id` of "Order Modifications and Product Exchanges" changes every pass.
- Any UI that pins a chart, alert, or saved view to a cluster id is meaningless across the 6-hour cron interval.
- Cross-pass `current_count` vs `baseline_count` (already wired into `getClusterTrendCounts`) compares two different rows and almost always reports the new id as "brand new."

The lineage table already has the right shape — `birth`, `death`, **`continuation`**, **`split`**, **`merge`** are all in `TAXONOMY_LINEAGE_TRANSITION_TYPES`. Only `birth` and `death` are emitted today. `continuation` is the missing transition.

## Proposed Model

Between steps 2 and 3 of the build pass, insert a **continuity matcher** that walks the new tree against the previously-active tree and reuses old ids when a confident match exists.

### Match At The Cluster Level, Not The Tree Level

For each new cluster `N`, find candidate previously-active clusters in the same project + dimension by:

1. Compute cosine similarity between `N.centroid` and every active cluster's centroid (already an indexable `centroid_embedding` in pgvector).
2. Take the top-K (e.g. K = 8) candidates.

Then run a **one-shot Hungarian assignment** over the bipartite graph of `new clusters × old clusters` to enforce 1:1 matching above a threshold. This is what Moda's clustering writeup describes as the lineage layer.

### Thresholds By Transition Type

| Transition  | Condition (cos = pre-built centroid cosine, similarity-of-mass-overlap optional) |
|-------------|-----------------------------------------------------------------------------------|
| `continuation` | Top match cos ≥ `CONTINUATION_THRESHOLD` (≈ 0.92) **and** one-to-one |
| `split`     | One old cluster maps to two or more new clusters, each above `SECONDARY_LINK_THRESHOLD` (≈ 0.86) |
| `merge`     | Two or more old clusters map to one new cluster, each above `SECONDARY_LINK_THRESHOLD` |
| `birth`     | New cluster has no match ≥ secondary threshold |
| `death`     | Old cluster has no match ≥ secondary threshold and is not part of a split |

The exact numbers should come from offline tuning, not hand-picked. The schema already supports all five transitions.

### How To Reuse Ids

When a new cluster matches an old one as `continuation`:

1. **Replace the freshly generated cuid** in the in-memory build result with the old cluster's id before persisting.
2. The save path then `upsert`s — the old row's `state` stays `active`, `centroid` updates to the new one, `name` may update if it changed, and `clusteredAt` advances.
3. Emit a `continuation` lineage row.
4. Do not emit `birth` for it and do not emit `death` for the matched old cluster.

For `split`: keep the old cluster id on the largest descendant by mass, emit `split` with `fromClusterIds = [old]` and `toClusterIds = [largest_new, ...other_new]`. The smaller descendants get fresh ids and `birth` rows.

For `merge`: the inverse. The survivor takes whichever old cluster had the most mass; other old clusters get `merged` state with `mergedIntoClusterId` set, exactly as the old `mergeNearDuplicateClustersUseCase` did.

### Naming Stability

When `continuation` reuses an old id, **also reuse the old name** unless the LLM produces something materially different. A simple heuristic: skip re-naming the cluster if its centroid moved less than some threshold (e.g. cos > 0.95 vs. the matched old centroid) and its top FPS-sampled summaries still cluster near the old name embedding. This avoids cosmetic name churn ("Returns and Refunds" → "Order Returns" → "Refund Requests") across passes when the underlying topic is unchanged.

### Open Questions

- Should the matcher operate per-depth (siblings of siblings) or globally across the tree? Per-depth is simpler and avoids cross-depth identity swaps that would confuse the UI. Global allows recovering when an old leaf is "the same topic" as a new interior, which can happen on schedule changes.
- How to handle a cluster that's clearly the same topic but whose centroid drifted past the continuation threshold because the underlying corpus shifted (e.g. seasonality)? Maybe a secondary signal: if the cluster's named members in CH overlap (same session_ids in the live window), trust `continuation` even at lower cosine.
- The lineage emitter currently emits every transition with a fresh lineage id. Should `continuation` rows be elided when they are no-ops (centroid moved <ε, name unchanged)? Probably yes, to keep the lineage feed signal-heavy.

## Storage And Read Implications

No schema changes. `taxonomy_clusters` already has the columns. `taxonomy_cluster_lineage` already supports all transition types. The continuity matcher is purely an algorithmic addition to the build pass.

Read paths that already exist become genuinely useful:

- `getClusterTrendCounts` (current vs baseline) starts producing real trends, not "every cluster spiked because the id is new."
- The behaviours table's `trend` field (`new`, `spike`, `rising`, `steady`, `cooling`, `fading`) starts reflecting actual topic momentum.
- Cross-pass `subtreeObservationCount` deltas are meaningful for the first time.

## Cost

For a project with ~30 active clusters:

- 30 × 30 pairwise centroid cosines ≈ 900 dot products of 2048-D vectors → microseconds.
- Hungarian on a 30×30 matrix → microseconds.
- Total addition per gardening pass: bounded, far below LLM naming cost.

The matcher pays for itself the first time a chart stops showing a 100% reset every 6 hours.

## Recommendation

Implement the matcher as a pure function in `packages/domain/taxonomy/src/clustering.ts` (or a new `lineage.ts` sibling), wired into `buildHierarchicalTaxonomyUseCase` between the in-memory tree assembly and the `clustersRepo.save` loop. Bias toward `continuation` — false continuations are visually a no-op; false `birth`+`death` pairs break trend UIs.
