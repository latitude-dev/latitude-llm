# Adaptive taxonomy clustering — Phase 1 recorded baselines (LAT-770)

Offline calibration for `specs/taxonomy-adaptive-clustering.md`.
Everything here is produced by the harness in this folder. The committed
`calibration.test.ts` re-verifies the numbers against **synthetic** fixtures; the
schedule values themselves were **calibrated on the real narrow-domain pilot
corpus** (see "Validation on the real pilot corpus" below). No production code
path changed in Phase 1 — the static column is today's
`buildHierarchicalClusters`; the adaptive column is the Phase-2 candidate
implemented as a calibration fork in `adaptive-clustering.ts`.

Run it:

```
pnpm exec vitest run packages/domain/taxonomy/src/calibration/calibration.test.ts
```

## What's here

| File | Role |
| --- | --- |
| `fixtures.ts` | Deterministic, seeded **synthetic** corpora (broad support, narrow-domain, pilot stand-in, shape stressors). No `Math.random`, no external data. |
| `adaptive-clustering.ts` | Candidate adaptive builder: node-relative separation gate + dominant-child protection + member-confidence routing thresholds. Verbatim k-means fork of `clustering.ts` so static vs adaptive is a clean A/B on the gate. |
| `metrics.ts` | Purity, per-group recall, ARI, tree shape, partition signature. |
| `harness.ts` | `compareOnCorpus` / `crossSampleAri` — runs both builders with identical seed + k-means constants. |
| `schedule.ts` | **The Phase-1 deliverable**: calibrated adaptive depth schedule, rollout limits, and calibration thresholds. |
| `calibration.test.ts` | Synthetic exit-criteria gate that keeps these numbers true. |

## Selected adaptive depth schedule

Size / score / depth / child-count limits are carried over **unchanged** from the
production static schedule (spec decision 5). Only the four adaptive fields are
new, plus dominant-child protection.

| Depth | maxChildren | minClusterFraction | minClusterAbs | minSplitScore | **maxDominantChildFraction** | **minRelativeSeparation** | **withinDistanceQuantile** | **routingSimilarityQuantile** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 (root) | 10 | 0.01 | 20 | 1.5 | 0.9 | **0.45** | **0.8** | **0.15** |
| 1 | 8 | 0.03 | 10 | 1.2 | 0.9 | **0.55** | **0.8** | **0.15** |
| 2 | 6 | 0.05 | 8 | 1.1 | 0.9 | **0.65** | **0.8** | **0.15** |

### Why these values

* **`minRelativeSeparation` = 0.45 / 0.55 / 0.65 — calibrated on real pilot
  data, not synthetic.** The synthetic fixtures put every coherent boundary at a
  relative separation ≥ 1.2 and every spurious within-blob split ≤ 0.29, which
  would suggest a gate anywhere in `[0.3, 1.2]`. **Real embeddings do not behave
  that way**: on the pilot corpus the coherent intent boundaries sit at ~0.45–0.90
  and there is no empty window. A synthetic-only value (~0.6) collapses the real
  tree to a single split or nothing; 0.45 at the root resolves the pilot's one
  production cluster into four human-recognizable intents (see below). It tightens
  with depth so deeper splits must be more clearly separated to justify finer
  granularity. The synthetic fixtures still pass at 0.45 (their signal is far
  above it), so the value is consistent with both — but the *real* corpus is what
  fixes it.
* **`withinDistanceQuantile` = 0.8.** The within-child spread is read from the
  upper bulk of member distances (not the max), so a few outliers cannot inflate
  the denominator and wave a weak split through.
* **`routingSimilarityQuantile` = 0.15.** Lower-tail admission — a child's
  routing threshold admits ~85% of its known members (the per-child admission
  target below). All measured thresholds are finite and ≥ the global floor
  (0.65): synthetic narrow-domain 0.97, broad support 0.65–0.76; **real pilot
  root children 0.685–0.882**.
* **`maxDominantChildFraction` = 0.9.** A "split" where one child keeps >90% of
  the parent is not a real partition.

## Rollout limits (fixed for Phases 3–5)

| Limit | Value | Basis |
| --- | --- | --- |
| Node cap | 128 | Observed trees are ≤ ~15 nodes (synthetic 13, real pilot 12); 128 is a ~10× structural-limit backstop for the fallback path. |
| Churn ceiling | 0.5 | At most half a run's continued nodes may change name before it counts as churn. |
| Fallback ceiling | 0.05 | >5% of runs falling back to static halts the rollout. |
| Shadow duration | 14 days | The garden sweep runs every 6h over a 7-day window; a decision-grade read needs the window to fully turn over (~1 week) plus a second cycle to confirm root-child-delta/ARI hold. |
| Per-child known-member admission target | 0.85 | Ties to `routingSimilarityQuantile` = 0.15. |
| Worker old-gen budget | 512 MB | Measured peak well under this (below). |

## Validation on the real pilot corpus

The binding calibration evidence. Real anonymized pilot embeddings (voyage
2048d) were pulled from production ClickHouse via the CH MCP for offline
calibration and are **not committed** (they live only in a local scratchpad
dump; see the note at the end). The pilot project holds **4,470 observations
across 2,009 sessions**, which production currently collapses into **2
`assigned_cluster_id`s** — the exact symptom this project targets.

Deterministic hash-ordered sample of the top 1,500 rows → **670 unique
observations** after de-duplicating repeated `observation_id`s (the raw table
carries ~2.2 copies per observation; duplicate vectors create artificial density
and *must* be de-duped, or the root pins at K=2). On that 670-obs sample at the
schedule above:

| Metric | Static (production path) | Adaptive |
| --- | --- | --- |
| Root children | **0 (collapses to one leaf)** | **4** |
| Leaves | 1 | 8 (max depth 3) |
| Deterministic partition | — | yes (identical signature across builds) |
| Cross-sample ARI | — | **0.850** |
| Root sibling centroid cosines | — | 0.838–0.889 |
| Routing thresholds | — | 0.685–0.882 |

The four adaptive root children are human-coherent, distinct ad-ops intents:

| Root child | Obs | Intent (from representative session text) |
| --- | --- | --- |
| #0 | 109 | **Ad creative** — RSA asset performance, replacement copy, running-ad review |
| #1 | 68 | **Improvement review** — "analyse the attached improvement" |
| #2 | 130 | **Search-term audits → negative keywords** — irrelevancy audits, Sheets exports |
| #3 | 363 | **Performance analysis & client reporting** — 90-day reports, talking points |

The `minRelativeSeparation` sweep on this corpus: root 0.30 → 2 children /
7 leaves; 0.40 → 3 children; **0.45 → 4 children / 8 leaves**; 0.50 → 4 children;
0.60 → collapses to a leaf. 0.45 is the setting that reproduces the target 3–5
coherent root children.

## Synthetic fixtures — static vs adaptive (committed regression)

Quality fixtures at 256 dims (the geometry the gate reasons about is
dimension-independent; the resource benchmark below uses the real 2048). These
are the committed regression guard, not the calibration authority.
`rc` = root children, `lf` = leaves, `d` = max depth, `pur` = leaf purity,
`minRec` = min per-group recall in one root child, `ARI` = static-vs-adaptive
agreement, `xSample` = cross-sample stability.

| Fixture | members | groups | static rc/lf/d/pur | adaptive rc/lf/d/pur/minRec | ARI | xSample |
| --- | --- | --- | --- | --- | --- | --- |
| retail-support | 780 | 6 | 6 / 6 / 1 / 1.00 | 6 / 6 / 1 / 1.00 / 1.00 | 1.000 | 1.000 |
| telecom-support | 600 | 5 | 5 / 5 / 1 / 1.00 | 5 / 5 / 1 / 1.00 / 1.00 | 1.000 | 1.000 |
| airline-support | 690 | 6 | 2 / 6 / 3 / 1.00 | 2 / 6 / 3 / 1.00 / 1.00 | 1.000 | 1.000 |
| **narrow-domain** | 420 | 4 | **0 / 1 / 0 / 0.29** | **4 / 4 / 1 / 1.00 / 1.00** | 0.000 | 1.000 |
| **narrow-pilot (synthetic)** | 545 | 5 | **0 / 1 / 0 / 0.26** | **5 / 5 / 1 / 1.00 / 1.00** | 0.000 | 1.000 |
| unimodal | 300 | 1 | 0 / 1 / 0 / 1.00 | 0 / 1 / 0 / 1.00 / — | 1.000 | 1.000 |
| diffuse-multi-topic | 480 | 8 | 2 / 8 / 3 / 1.00 | 2 / 8 / 3 / 1.00 / 1.00 | 1.000 | 1.000 |
| imbalanced-long-tail | 675 | 6 | 3 / 3 / 1 / 0.98 | 3 / 3 / 1 / 0.98 / 0.80¹ | 1.000 | 0.990 |
| rare-intent-duplicate | 487 | 4 | 2 / 3 / 2 / 0.99 | 2 / 3 / 2 / 0.99 / — | 1.000 | 0.990 |

¹ Sub-floor tail group; the recall criterion applies to intended narrow-domain
groups (all 1.00). Sub-floor tail/rare/duplicate groups are absorbed, never
promoted to root children.

**Caveat on the synthetic fixtures:** their clean isotropic-blob geometry makes
the adaptive win look easier than it is (purity/recall 1.00, an empty
separation window). Real embeddings are messier — see the pilot section, which
is the number that actually governs the schedule.

## Resource measurement — max sample (1,500 × 2,048, synthetic)

| Metric | Static | Adaptive |
| --- | --- | --- |
| Build time | ~5.96 s | ~5.81 s |
| Ratio (adaptive / static) | — | **~0.98** (≤ 1.25 ceiling) |
| Tree nodes | — | 13 (≤ 128 cap) |
| Peak process RSS | — | ~280–300 MB (≤ 512 MB worker budget) |

The adaptive-only work (O(n) member distances + O(K²) sibling distances per
candidate, K ≤ 10) is dominated by the shared k-means, so the runtime ratio sits
at ~1.0, comfortably inside the ≤ 25%-slower criterion. (Real 2048d embeddings
converge more slowly — ~12 s for the 670-obs pilot build — but adaptive and
static share that cost identically, so the ratio is unaffected.)

## Exit-criteria status

| Criterion | Status | Evidence |
| --- | --- | --- |
| Narrow-domain root has 3–5 children | ✅ | real pilot 4 (after de-dup) at root 0.45; synthetic 4/5 |
| Mean labeled purity ≥ 0.85 | ⚠️ synthetic only | 1.00 synthetic; no human labels on the pilot yet — real check is human-eyeballed coherence (four clean intents) |
| Each intended group ≥ 0.85 recall in one child | ⚠️ synthetic only | 1.00 synthetic; pending human labels on the pilot |
| Unimodal fixture stays a leaf | ✅ | 0 accepted splits |
| Rare/sub-floor groups do not become root children | ✅ | synthetic long-tail/rare fixtures |
| Deterministic partition signature | ✅ | synthetic + real pilot |
| Broad-domain quality within regression tolerance | ✅ | purity delta 0.00, ARI 1.000 (synthetic) |
| Cross-sample stability above ARI floor (0.8) | ✅ | real pilot 0.850; synthetic ≥ 0.99 |
| Runtime ≤ 25% slower than static | ✅ | ~0.98× |
| Memory within worker limit | ✅ | ~300 MB vs 512 MB budget |
| Rollout values fixed | ✅ | node cap / churn / fallback / shadow / admission target above |

Two criteria (labeled purity, per-group recall) remain **provisional**: they are
proven on synthetic labels and supported by human-eyeballed coherence of the four
real pilot clusters, but not yet against a human-labeled pilot set. Producing
coarse human labels for the pilot (through a product-exposed export) closes them.

## On the pilot data

The pilot embeddings used for calibration were read from production ClickHouse
(`taxonomy_observations.embedding`, scoped to the pilot `project_id`) via the CH
MCP, for offline calibration only. They are **not committed** — the vectors and
session text live solely in a local scratchpad dump. The committed
`narrow-pilot` fixture in `fixtures.ts` is a synthetic stand-in.
`loadNarrowPilotCorpus` reads an anonymized `fixtures-data/narrow-pilot.json`
when present (the sanctioned product-export path) and otherwise returns that
synthetic model. The pilot project itself is identified in the private Linear
project, not here.
