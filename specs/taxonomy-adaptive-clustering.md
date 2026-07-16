# Taxonomy adaptive clustering

> **Canonical spec:** this file. The Linear project ["Taxonomy adaptive clustering"](https://linear.app/latitude/project/taxonomy-adaptive-clustering-15ed0cc96307/overview) tracks the phase issues.
>
> **Documentation after stabilization:** `dev-docs/taxonomy.md` and `dev-docs/conversation-intelligence.md`.
>
> **Origin:** a specialized ads-analytics pilot project (customer + project id in the private Linear project). Its recent sessions contain several distinct intents, but production collapses them into one cluster because the root sibling-cosine gate is fixed at `0.85`.

## Purpose

Taxonomy split decisions must adapt to the semantic density of each project's traces. Absolute cosine similarity is not comparable across projects. A broad support corpus and a narrow specialized corpus can contain equally useful intent boundaries at very different cosine values.

Keep the divisive spherical k-means tree builder, but replace its absolute sibling-cosine rejection rule with node-relative separation. Each node evaluates candidate splits against the spread of its own members.

## Current behavior

`buildHierarchicalClusters` sweeps K at each node, runs deterministic spherical k-means++ restarts, and selects by a cosine-adapted Calinski-Harabasz score after these gates:

* minimum child size;
* fixed maximum sibling centroid cosine;
* fixed minimum split score.

Current sibling limits are `0.85`, `0.90`, and `0.93` by depth. The pilot project's manually identified intent centroids were often between `0.95` and `0.99`, so every candidate split is rejected before relative quality can decide whether it is useful.

The previous recursive gardening implementation derived child density from each parent's member-pairwise distribution. The current divisive rewrite lost that corpus-relative behavior.

## Goals

* Adapt split acceptance to each node's embedding geometry.
* Preserve deterministic worker-thread and Temporal behavior.
* Keep minimum size, score, depth, and child-count limits.
* Add dominant-child protection.
* Derive online descent thresholds from accepted member assignments.
* Preserve subtree reads and the hidden depth-0 root.
* Preserve stable cluster identities where possible.
* Refresh stale names after structural changes.
* Make decisions observable without logging customer content or embeddings.
* Roll out through offline calibration, shadow mode, and staged enforcement.

## Non-goals

* Replacing spherical k-means.
* Adding project threshold settings to the UI.
* Using historical runs as a feedback loop.
* Changing the seven-day lookback or day-stratified sampling.
* Switching to `session_user_intent_embedding` in this project.
* Reintroducing incremental recurse/merge/noise gardening.
* Changing the Behaviors empty state.

## Scope: global and custom behaviors

The global taxonomy garden and the custom-behavior-scoped garden share one builder, one depth schedule, one publish path, and the same mode gate — global vs scoped is a `customBehaviorId` parameter, not a fork. Every change here applies to both, and `off` must be byte-identical on both. Custom behaviors are not yet in production, so adaptive enforcement affects only the live global tree today; the pilot rollout carries no scoped-tree risk. The online routing threshold is global-only by design — scoped trees are assigned by full reassignment into `custom_behavior_assignments`, never served by the online router (`listNearestActive` / `hybridSearch` are `custom_behavior_id IS NULL`). Phase-3 QA must still cover the scoped write target, since the shared code runs it under test before the feature launches.

## Adaptive split algorithm

The depth schedule retains scale-free policy:

```ts
interface DepthSchedule {
  maxChildren: number
  minClusterFraction: number
  minClusterAbs: number
  minSplitScore: number
  maxDominantChildFraction: number
  minRelativeSeparation: number
  withinDistanceQuantile: number
  routingSimilarityQuantile: number
}
```

For each K candidate:

1. Build child memberships.
2. Reject empty or undersized children.
3. Calculate dominant-child fraction.
4. Calculate each member's cosine distance to its assigned child centroid.
5. Resolve `withinDistance` using the configured quantile.
6. Calculate all sibling-centroid cosine distances and take the minimum as `closestSiblingDistance`.
7. Calculate relative separation.
8. Apply size, dominance, score, and relative-separation gates.

```text
memberDistance(x) = 1 - cosine(x, assignedCentroid(x))
withinDistance = quantile(memberDistance, withinDistanceQuantile)
closestSiblingDistance = min(1 - cosine(childCentroidA, childCentroidB))
relativeSeparation = closestSiblingDistance / max(withinDistance, 1e-6)
```

A candidate is valid when:

```text
smallestChildSize >= resolved minimum child size
dominantChildFraction <= maxDominantChildFraction
CalinskiHarabaszScore >= minSplitScore
relativeSeparation >= minRelativeSeparation
```

Choose the valid candidate with the highest Calinski-Harabasz score. Resolve exact score ties by lower K, then deterministic restart order.

Cosine distances are clamped to `[0, 2]`. Quantiles use linear interpolation at position `(n - 1) * q` in the sorted values.

## Online routing threshold

`splitLinkThreshold` becomes the lower-bound cosine similarity required to descend from a parent to a chosen child.

For each child, calculate a lower-tail quantile of known member similarity to that child centroid. The parent threshold is:

```text
childThreshold = quantile(member-to-own-centroid similarities, routingSimilarityQuantile)
splitLinkThreshold = max(globalAbsoluteThreshold, min(all childThresholds))
```

This prevents a large or easy child from controlling the threshold. The existing relative-margin gate still handles ambiguity between siblings.

Remove `computeSplitLinkThreshold`; sibling-centroid similarity and member routing confidence are different boundaries.

## Full live-window reassignment and publication

The clustering sample is capped at 1,500, while active reads can include up to 10,000 observations. Reassigning only the sample can leave unsampled observations pointing to deprecated cluster ids.

New clusters are saved with a `staging` state. Active reads and online routing ignore them.

Publication sequence:

1. Save the full new tree as staging clusters.
2. Read slim observation-id and embedding pages from the complete bounded live window.
3. Route each embedding to staging leaves in memory.
4. Write assignments in bounded ClickHouse batches.
5. Confirm the bounded snapshot no longer points to clusters scheduled for deprecation.
6. In one Postgres transaction, deprecate the old tree and activate the staged tree.
7. Run one bounded catch-up pass for observations indexed during reassignment.

If reassignment fails, leave the old tree active and clean up abandoned staging rows. Active reads must never observe the old and new trees simultaneously.

`taxonomy_clusters.state` is already a varchar, so adding `staging` changes the domain contract without requiring a Postgres migration.

## Lineage and naming

Keep same-depth Hungarian continuation matching and the existing birth/death/continuation transitions.

A continued node must be renamed when:

* it changes from leaf to interior or interior to leaf;
* its child count changes.

Same-shape, high-similarity continuations may still reuse their names. This prevents a stale name such as "Keyword Quality Score Analysis" from surviving when the node becomes an umbrella over several new behaviors.

## Determinism and resource bounds

The builder remains a pure function of normalized embeddings, depth schedule, project-derived seed, and k-means constants. It must not read project settings, run history, current time, or external services. It must not use `Math.random()`.

Adaptive metrics reuse existing candidate assignments and centroids. Member distances are O(n) per candidate; sibling distances are O(K squared), with K capped at 10.

The clustering worker must add:

* an explicit wall-clock timeout;
* cancellation cleanup;
* `worker.terminate()`;
* Node worker `resourceLimits`;
* one shared deadline and memory budget for static plus adaptive shadow execution.

## Observability

Emit bounded structured telemetry:

* policy version and mode;
* observations sampled;
* node, leaf, and maximum-depth counts;
* selected K by depth;
* accepted and rejected candidates;
* rejection reasons: undersized child, dominant child, low score, low relative separation;
* accepted relative-separation distribution;
* routing-threshold distribution;
* static-versus-adaptive comparison in shadow mode;
* continuation and naming churn;
* fallback reason.

Do not log embeddings, per-member assignments, conversation content, or unbounded candidate arrays.

## Rollout

Validated environment setting:

```text
LAT_TAXONOMY_ADAPTIVE_CLUSTERING_MODE=off|shadow|enforced
```

The activity layer reads the setting. Temporal workflow code must not read environment state. If the workflow command sequence changes, add a `patched()` marker.

* `off`: persist the static tree.
* `shadow`: persist static, compute adaptive for comparison.
* `enforced`: persist adaptive.

All fallback selection occurs in the planning activity before staging the Redis plan artifact or starting writes. Fall back to static on structural-limit or non-finite output violations.

**The gate is introduced in Phase 3, not Phase 4.** Every Phase-3 mechanism change (staging + atomic swap, full live-window reassignment, member-confidence routing thresholds, shape-aware naming) also alters the live publication path for the *static* tree, so it must be gated from the moment it lands. `off` is a guaranteed no-op: it reproduces the pre-change path exactly — static builder, `computeSplitLinkThreshold`, sample-only reassignment, centroid-similarity naming, and the original publish sequence. Only `shadow`/`enforced` exercise the new machinery. The workflow command sequence stays mode-independent (one `patched()` marker for the new activity shape); the activities branch on mode internally, never the workflow. Phase 4 then builds shadow comparison and enforced planning on the gate that already exists.

## Evaluation

Required corpora:

* seeded retail, telecom, and airline support;
* narrow-domain synthetic data with known intents and centroid cosines above `0.85`;
* anonymized embeddings from the narrow-domain pilot project with coarse human labels;
* tight unimodal data;
* diffuse multi-topic data;
* imbalanced long-tail data;
* rare-intent and duplicate-vector data.

Acceptance criteria include:

* narrow-domain root has three to five children;
* mean labeled purity at least `0.85`;
* each intended group has at least `0.85` recall in one child;
* unimodal fixture remains a leaf;
* rare groups below the minimum do not become root children;
* deterministic partition signature and decision metadata;
* broad-domain quality within the calibrated regression tolerance;
* cross-sample stability above the calibrated ARI floor;
* runtime no more than 25% slower than static;
* memory within the worker limit;
* rollout values fixed before enforcement: node cap, churn ceiling, fallback ceiling, shadow duration, and per-child known-member admission target.

The narrow-domain pilot project (identified in the private Linear project) is the first enforced production verification project.

## Decisions

 1. Adaptivity is node-local.
 2. Keep divisive spherical k-means.
 3. Remove absolute `maxSiblingCosine` from the schedule.
 4. Evaluate closest-sibling distance relative to within-child distance.
 5. Keep static scale-free limits for size, score, depth, child count, and dominance.
 6. Derive online routing thresholds from member-to-child confidence.
 7. Keep the adaptive builder pure with no historical feedback loop.
 8. Use shadow mode before enforcement.
 9. Force naming refresh after structural changes.
10. Keep session intent projection as separate work.
11. Use logs and spans before adding durable run-decision storage.
12. Reassign the complete bounded live window before publishing the tree.
13. Resolve rollout mode in activity code, never workflow code.
14. Publish staged trees through one atomic Postgres active-tree swap.

## Implementation phases

### Phase 1: evaluation and calibration

* Build the comparison harness.
* Add synthetic and production-derived fixtures.
* Record static baselines.
* Select schedule values and rollout limits.
* Measure maximum-sample runtime and memory.

Exit: the adaptive policy meets quality, stability, and resource criteria with numeric values recorded.

### Phase 2: pure adaptive builder

* Extend `DepthSchedule`.
* Add relative-separation and routing helpers.
* Replace absolute sibling rejection.
* Add lower-K tie-breaking.
* Return bounded diagnostics.
* Add direct production-schedule tests.
* Add worker timeout, cancellation, termination, and memory limits.

Exit: deterministic output, narrow-domain separation, unimodal suppression, finite metrics, and bounded resources.

### Phase 3: gardening integration

* Introduce the rollout mode gate (`LAT_TAXONOMY_ADAPTIVE_CLUSTERING_MODE`, default `off`) here — moved earlier from Phase 4 so no mechanism change ships to production ungated. `off` reproduces the current path exactly; `shadow`/`enforced` exercise the new machinery.
* Widen `taxonomyClusterStateSchema` and `TAXONOMY_CLUSTER_STATES` to include `staging` (domain-contract widening; the column is already `varchar(16)`, no Postgres migration).
* Thread bounded decision metadata through planning.
* Store accepted routing thresholds.
* Add shape-aware naming refresh.
* Add `staging` state and atomic activation/deprecation; keep the workflow command sequence mode-independent and carry one `patched()` marker for the new activity shape.
* Reassign the full bounded live window.
* Add invariant checks, abandoned-staging cleanup, and catch-up assignment.
* Verify every subtree-based read surface.

QA: invariant tests that no active read (`listActiveByProject`, `listNearestActive`, list-clusters, analytics) returns a `staging` row; atomic-swap test leaves exactly one active tree; injected-failure test proves the old tree stays active and staging rows are cleaned up; catch-up test assigns observations indexed mid-reassignment; the reassignment and atomic-swap tests run against both write targets — global `taxonomy_observations.assigned_cluster_id` and scoped `custom_behavior_assignments` — since the shared publish path forks only there; naming test forces a rename on leaf↔interior or child-count change and keeps the name on a same-shape high-similarity continuation; a golden regression on the seeded Acme corpus proves `off` output is byte-identical to pre-change for both the global and scoped paths; a Temporal replay test proves the `patched()` marker reconciles an in-flight pre-change history.

Exit: the bounded snapshot is assigned before publication, active reads never see two trees, stale names cannot survive structure changes, `off` is a verified no-op, and the quality gate passes.

### Phase 4: shadow mode

* Build on the gate introduced in Phase 3 — the switch already exists here.
* Implement off, shadow, and enforced planning.
* Add bounded comparison telemetry and fallback reasons.
* Run shadow across contrasting projects.
* Record schedule adjustments and rollout findings.
* Verify Temporal replay safety.

QA: a static-vs-adaptive shadow-comparison report derived from telemetry alone (no content, no embeddings); a Temporal replay test across the mode branches; guardrail assertions that no structural or resource violation occurs across the contrasting-project shadow runs; a fault-injection test that non-finite or structural-limit adaptive output falls back to static in the planning activity; re-confirm `off` stays a no-op.

Exit: no structural or resource guardrail violations, and every collapse/expansion can be explained from telemetry.

### Phase 5: enforcement and docs

* Enforce for the pilot project.
* Verify online assignments and parent residue.
* Expand to contrasting projects.
* Enable globally after exit criteria pass.
* Update taxonomy and conversation-intelligence documentation.
* Correct stale documentation that says the clustering sample cap is 10,000 instead of 1,500.
* Decide whether intent projection is required based on shadow results.

QA: a pilot-project acceptance run confirming the root gains 3–5 children, labeled purity/recall targets hold, online assignments land, and parent residue is correct; a rollback drill that flips `enforced`→`off` and confirms the next garden pass restores static behavior with no orphaned staging rows; a doc-accuracy check that the "10,000" sample-cap claim is gone from `dev-docs`.

Exit: adaptive is the production default, evaluation targets pass, docs match behavior, and rollback remains available.

### Phase 6: cleanup

* Remove the static sibling-cosine path after the observation period.
* Remove shadow-only code.
* Remove deprecated constants and tests.
* Decide whether to keep the environment kill switch.
* Promote final decisions to `dev-docs` and retire the repository spec.
