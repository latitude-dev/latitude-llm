/**
 * Cross-run lineage continuity matcher for the divisive taxonomy build.
 *
 * The gardening build rebuilds the whole tree from scratch every pass. Without
 * a matcher, every node gets a fresh cuid, so the previous pass's clusters all
 * "die" and the new ones are all "born" — any chart, alert, or trend that keys
 * on `taxonomy_clusters.id` resets every 6 hours and cross-pass count deltas
 * (current vs baseline) are meaningless.
 *
 * This module is the missing layer: given the freshly built nodes and the
 * previously-active clusters, it finds the confident 1:1 topic matches and lets
 * the build reuse the old id (emitting `continuation` instead of birth+death).
 *
 * Algorithm:
 *   - Build a cosine-similarity matrix of new nodes × old clusters, masking
 *     cross-depth pairs (a tight leaf must not steal a broad root's id — depth
 *     identity is stable for the UI).
 *   - Solve a one-shot **Hungarian assignment** (Kuhn–Munkres) that maximizes
 *     total similarity under a strict 1:1 constraint.
 *   - Accept an assigned pair as a `continuation` only when its cosine clears
 *     `continuationThreshold`. Everything else is `birth` (new node) / `death`
 *     (old cluster), exactly as before.
 *
 * Pure and dependency-free (only the cosine primitive). Deterministic given the
 * inputs, so a gardening pass replays identically under Temporal.
 *
 * Split / merge transitions are intentionally NOT modelled: a confident 1:1
 * continuation carries the identity that trend UIs need, and false continuations
 * are a visual no-op while false birth+death pairs break the charts. See
 * `dev-docs/taxonomy.md`.
 */

import { cosineSimilarityNormalized } from "./helpers.ts"

/** A node in the freshly built tree, awaiting an id. */
export interface LineageNewNode {
  /** Stable handle for this node within the current build (not a cuid yet). */
  readonly tempId: string
  readonly depth: number
  /** L2-normalized centroid of the node's members. */
  readonly centroid: readonly number[]
}

/** A previously-active cluster the new node may continue. */
export interface LineageOldCluster {
  readonly id: string
  readonly depth: number
  /** L2-normalized centroid. */
  readonly centroid: readonly number[]
}

export type LineageDecision =
  | {
      readonly tempId: string
      readonly transition: "continuation"
      /** The old cluster id this node reuses. */
      readonly reuseId: string
      readonly similarity: number
      /** True when the topic barely moved — carry the old name instead of re-naming. */
      readonly carryName: boolean
    }
  | { readonly tempId: string; readonly transition: "birth" }

export interface TaxonomyLineageMatch {
  /** One decision per new node, in the same order as `newNodes`. */
  readonly decisions: readonly LineageDecision[]
  /** Old cluster ids consumed by a continuation — the rest are deaths. */
  readonly matchedOldIds: ReadonlySet<string>
}

export interface MatchTaxonomyLineageInput {
  readonly newNodes: readonly LineageNewNode[]
  readonly oldClusters: readonly LineageOldCluster[]
  /** Minimum centroid cosine for a 1:1 match to count as a continuation. */
  readonly continuationThreshold: number
  /** Above this cosine the topic is unchanged enough to keep the old name. */
  readonly nameReuseThreshold: number
}

// ---------------------------------------------------------------------------
// Hungarian (Kuhn–Munkres) minimum-cost assignment on a square matrix.
//
// Classic O(n³) potentials implementation. We minimize cost, so the caller
// converts "maximize similarity" into "minimize (1 - similarity)" and pads the
// matrix to square with a sentinel cost that the optimizer always avoids in
// favour of any real low-cost pair.
//
// Returns `assignment[row] = column` (or -1 if a row maps to nothing, which can
// only happen for an empty matrix).
// ---------------------------------------------------------------------------

export const solveAssignment = (cost: readonly (readonly number[])[]): number[] => {
  const n = cost.length
  if (n === 0) return []

  // 1-indexed potentials/state per the standard formulation.
  const u = new Array<number>(n + 1).fill(0)
  const v = new Array<number>(n + 1).fill(0)
  const p = new Array<number>(n + 1).fill(0) // p[col] = row matched to col (0 = none)
  const way = new Array<number>(n + 1).fill(0)

  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY)
    const used = new Array<boolean>(n + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0] ?? 0
      const row = cost[i0 - 1] ?? []
      let delta = Number.POSITIVE_INFINITY
      let j1 = 0
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue
        const cur = (row[j - 1] ?? 0) - (u[i0] ?? 0) - (v[j] ?? 0)
        if (cur < (minv[j] ?? Number.POSITIVE_INFINITY)) {
          minv[j] = cur
          way[j] = j0
        }
        if ((minv[j] ?? Number.POSITIVE_INFINITY) < delta) {
          delta = minv[j] ?? Number.POSITIVE_INFINITY
          j1 = j
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          const pj = p[j] ?? 0
          u[pj] = (u[pj] ?? 0) + delta
          v[j] = (v[j] ?? 0) - delta
        } else {
          minv[j] = (minv[j] ?? Number.POSITIVE_INFINITY) - delta
        }
      }
      j0 = j1
    } while ((p[j0] ?? 0) !== 0)
    do {
      const j1 = way[j0] ?? 0
      p[j0] = p[j1] ?? 0
      j0 = j1
    } while (j0 !== 0)
  }

  const assignment = new Array<number>(n).fill(-1)
  for (let j = 1; j <= n; j++) {
    const row = p[j] ?? 0
    if (row >= 1) assignment[row - 1] = j - 1
  }
  return assignment
}

// Cost the optimizer treats as "never pair these" — any real pair (cost in
// [0, 1] since cosine ∈ [-1, 1]) is strictly preferred, so disallowed and
// padding cells are only ever chosen when a row has no allowed partner left.
const DISALLOWED_COST = 10

/**
 * Match the freshly built nodes against the previously-active clusters and
 * decide, per new node, whether it continues an old cluster (reusing its id) or
 * is born fresh.
 */
export const matchTaxonomyLineage = (input: MatchTaxonomyLineageInput): TaxonomyLineageMatch => {
  const { newNodes, oldClusters, continuationThreshold, nameReuseThreshold } = input
  const n = newNodes.length
  const m = oldClusters.length

  if (n === 0 || m === 0) {
    return {
      decisions: newNodes.map((node) => ({ tempId: node.tempId, transition: "birth" as const })),
      matchedOldIds: new Set<string>(),
    }
  }

  // Square cost matrix padded to max(n, m). Real cell = 1 - cosine for
  // same-depth pairs; cross-depth and padding cells are DISALLOWED_COST. We
  // keep the raw similarity alongside so the threshold check reads cleanly.
  const size = Math.max(n, m)
  const similarity: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(-1))
  const cost: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(DISALLOWED_COST))
  for (let i = 0; i < n; i++) {
    const node = newNodes[i]
    if (!node) continue
    const simRow = similarity[i]
    const costRow = cost[i]
    if (!simRow || !costRow) continue
    for (let j = 0; j < m; j++) {
      const old = oldClusters[j]
      if (!old || old.depth !== node.depth) continue
      const sim = cosineSimilarityNormalized(node.centroid, old.centroid)
      simRow[j] = sim
      costRow[j] = 1 - sim
    }
  }

  const assignment = solveAssignment(cost)

  const decisions: LineageDecision[] = []
  const matchedOldIds = new Set<string>()
  for (let i = 0; i < n; i++) {
    const node = newNodes[i]
    if (!node) continue
    const j = assignment[i] ?? -1
    const old = j >= 0 && j < m ? oldClusters[j] : undefined
    const sim = similarity[i]?.[j] ?? -1
    if (old && sim >= continuationThreshold) {
      matchedOldIds.add(old.id)
      decisions.push({
        tempId: node.tempId,
        transition: "continuation",
        reuseId: old.id,
        similarity: sim,
        carryName: sim >= nameReuseThreshold,
      })
    } else {
      decisions.push({ tempId: node.tempId, transition: "birth" })
    }
  }

  return { decisions, matchedOldIds }
}
