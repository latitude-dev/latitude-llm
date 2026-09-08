#!/usr/bin/env tsx
/**
 * Replay one project's real gardening history offline, pass by pass, and measure
 * whether its clusters survive from one pass to the next.
 *
 *   pnpm --filter @app/workflows exec tsx scripts/taxonomy-replay.mts <projectId> [passesPerDay]
 *
 * Reads the dump written by `taxonomy-replay-dump.mts`. No database, no Temporal,
 * no LLM: the two things under test — the builder and the lineage matcher — are
 * pure functions, so everything else is cost without signal.
 *
 * WHY THIS IS A CONTROLLED EXPERIMENT. The builder seeds mulberry32 from
 * `hash(projectId)`, so it is fully deterministic: identical members in identical
 * order produce an identical tree, every time. Running the same dump on two
 * builder versions therefore isolates the builder as the only variable, and any
 * difference in continuation rate is causal rather than variance. That is also
 * why the harness must reuse the PRODUCTION project id — a fresh id changes the
 * seed and silently builds a different tree.
 *
 * THE SAMPLE MUST MATCH PRODUCTION EXACTLY. Per pass:
 *   1. keep observations inside the trailing 7-day window
 *   2. rank each day's rows by cityHash64(observation_id) ascending
 *   3. take the globally lowest 1,500 by (rank, observation_id) — a round robin
 *      that draws rank 1 from every day, then rank 2, and so on
 *   4. feed the builder in `start_time DESC, observation_id ASC` order
 * Step 4 is load-bearing: k-means++ draws seeds as indices into the member list,
 * so a re-ordered pool builds a different tree from the same data. Step 2 is why
 * the dump carries the raw hash rather than a precomputed rank — the rank depends
 * on which rows the window admits, and the oldest day is only partly included.
 *
 * Output: <dump>/replay-<arm>.json, one record per pass. Compare arms with
 * `--arm` on two checkouts, or diff the JSON directly.
 */

import { readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  type ClusteringTreeNode,
  createTaxonomyCentroid,
  type LineageOldCluster,
  matchTaxonomyLineage,
  normalizeTaxonomyCentroid,
  type PriorClusterNode,
  runTaxonomyClusterBuild,
  TAXONOMY_CONTINUATION_THRESHOLD,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS,
  TAXONOMY_NAME_REUSE_THRESHOLD,
  updateTaxonomyCentroid,
} from "@domain/taxonomy"

const SAMPLE_CAP = 1_500
const DIMS = 2048

const projectId = process.argv[2]
const passesPerDay = Number(process.argv[3] ?? 4)
const arm = process.env.ARM ?? "unnamed"
if (!projectId) throw new Error("usage: taxonomy-replay.mts <projectId> [passesPerDay]")

const dir = join(homedir(), "Desktop", "taxonomy-replay", projectId)
const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as {
  dims: number
  rows: number
  observations: { id: string; sessionId: string; startTime: string; hash64: string }[]
}
if (meta.dims !== DIMS) throw new Error(`dump has ${meta.dims} dims, expected ${DIMS}`)

const raw = await readFile(join(dir, "embeddings.f32"))
const flat = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
if (flat.length !== meta.rows * DIMS) throw new Error("embeddings.f32 does not match meta.json")

// ClickHouse DateTime64(9) renders as "YYYY-MM-DD hh:mm:ss.nnnnnnnnn"; Date parses
// the millisecond prefix, which is ample for windowing and day bucketing.
const rows = meta.observations.map((o, index) => ({
  index,
  id: o.id,
  hash: BigInt(o.hash64),
  time: new Date(`${o.startTime.slice(0, 23).replace(" ", "T")}Z`).getTime(),
  day: o.startTime.slice(0, 10),
}))
rows.sort((a, b) => a.time - b.time)

const embeddingAt = (index: number): number[] => Array.from(flat.subarray(index * DIMS, (index + 1) * DIMS))

/** Reproduces `listForClusteringSample` for a window ending at `end`. */
const sampleFor = (end: number) => {
  const start = end - TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS * 86_400_000
  const inWindow = rows.filter((r) => r.time >= start && r.time <= end)

  const byDay = new Map<string, typeof inWindow>()
  for (const r of inWindow) {
    const bucket = byDay.get(r.day)
    if (bucket) bucket.push(r)
    else byDay.set(r.day, [r])
  }
  const ranked: { rn: number; row: (typeof inWindow)[number] }[] = []
  for (const bucket of byDay.values()) {
    bucket.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : a.id < b.id ? -1 : 1))
    bucket.forEach((row, i) => ranked.push({ rn: i + 1, row }))
  }
  ranked.sort((a, b) => a.rn - b.rn || (a.row.id < b.row.id ? -1 : 1))

  return ranked
    .slice(0, SAMPLE_CAP)
    .map((r) => r.row)
    .sort((a, b) => b.time - a.time || (a.id < b.id ? -1 : 1))
}

const flatten = (node: ClusteringTreeNode, out: ClusteringTreeNode[] = []): ClusteringTreeNode[] => {
  out.push(node)
  for (const child of node.children) flatten(child, out)
  return out
}

const seedFromProjectId = (id: string): number => {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (Math.imul(hash, 31) + id.charCodeAt(i)) >>> 0
  return hash === 0 ? 0x9e3779b9 : hash
}
const seed = seedFromProjectId(projectId)

const firstDay = new Date(rows[0]?.time ?? 0)
const lastTime = rows[rows.length - 1]?.time ?? 0
// Skip the first lookback window: earlier passes see a partial history production never saw.
let cursor = firstDay.getTime() + TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS * 86_400_000
const step = 86_400_000 / passesPerDay

const toPrior = (node: ClusteringTreeNode): PriorClusterNode => ({
  centroid: node.centroid,
  children: node.children.map(toPrior),
})

/**
 * Rebuild the prior tree the way PRODUCTION would read it back, rather than from
 * the builder's in-memory centroids.
 *
 * Production seeds from `taxonomy_clusters.centroid`, which is not a plain mean:
 * it is accumulated by `createTaxonomyCentroid` + one `updateTaxonomyCentroid`
 * per member, so each member is weighted by 0.5^(age / 30d) and the stored value
 * is a running decayed sum that `normalizeTaxonomyCentroid` turns back into a
 * direction. The in-memory centroid is an unweighted L2-normalized mean over the
 * same members. Same members, different weighting — so the arms differ only by
 * the seeding SOURCE, which is exactly the production-fidelity question.
 */
const toPriorPersisted = (
  node: ClusteringTreeNode,
  memberTimes: readonly Date[],
  embeddingOf: (i: number) => number[],
  now: Date,
): PriorClusterNode => {
  let centroid = createTaxonomyCentroid("replay")
  let clusteredAt = now
  for (const index of node.memberIndices) {
    const updated = updateTaxonomyCentroid({
      centroid: { ...centroid, clusteredAt },
      embedding: embeddingOf(index),
      weight: 1,
      timestamp: memberTimes[index] ?? now,
      operation: "add",
      previousClusteredAt: clusteredAt,
    })
    const { clusteredAt: next, ...rest } = updated
    centroid = rest
    clusteredAt = next
  }
  return {
    centroid: normalizeTaxonomyCentroid(centroid),
    children: node.children.map((child) => toPriorPersisted(child, memberTimes, embeddingOf, now)),
  }
}

let previous: LineageOldCluster[] = []
let priorTree: PriorClusterNode | undefined
let previousId = 0

// Chain tracking. The aggregate continuation rate is a mean-field number: it
// cannot distinguish "every behaviour is moderately unstable" from "most are
// rock-solid and a churny minority drags the average down". Those have opposite
// product consequences, so track each lineage individually.
let lineageId = 0
const lineageOfCluster = new Map<string, string>()
const chains = new Map<string, { first: number; last: number; passes: number; maxMembers: number; depth: number }>()
let passIndex = 0
const records: Record<string, unknown>[] = []

console.log(`${projectId} arm=${arm} seed=${seed} passes every ${24 / passesPerDay}h`)

while (cursor <= lastTime) {
  const members = sampleFor(cursor)
  if (members.length < TAXONOMY_GARDENING_MIN_OBSERVATIONS) {
    cursor += step
    continue
  }

  const started = performance.now()
  // Root-only warm start seeds from depth 1; full-tree seeds from the whole prior
  // shape. `runTaxonomyClusterBuild` only accepts a `priorTree`, so root-only is
  // expressed as a one-level prior: childless children stop the descent at depth 1,
  // leaving every interior split cold.
  const priorRootCentroids = previous.filter((c) => c.depth === 1).map((c) => c.centroid)
  const priorRootOnly: PriorClusterNode | undefined =
    priorRootCentroids.length > 0
      ? { centroid: [], children: priorRootCentroids.map((centroid) => ({ centroid, children: [] })) }
      : undefined
  const warmOn = process.env.TAXONOMY_WARM_START === "1"
  const fullTree = process.env.TAXONOMY_WARM_FULL === "1"
  const warmPrior = warmOn ? (fullTree ? priorTree : priorRootOnly) : undefined
  const { root, diagnostics } = runTaxonomyClusterBuild({
    mode: "enforced",
    embeddings: members.map((m) => embeddingAt(m.index)),
    seed,
    ...(warmPrior ? { priorTree: warmPrior } : {}),
  })
  const durationMs = performance.now() - started

  const nodes = flatten(root).filter((n) => n.depth > 0)
  const match = matchTaxonomyLineage({
    newNodes: nodes.map((n, i) => ({
      tempId: `t${i}`,
      depth: n.depth,
      centroid: n.centroid,
      isLeaf: n.children.length === 0,
      childCount: n.children.length,
    })),
    oldClusters: previous,
    continuationThreshold: TAXONOMY_CONTINUATION_THRESHOLD,
    nameReuseThreshold: TAXONOMY_NAME_REUSE_THRESHOLD,
  })

  const continued = match.decisions.filter((d) => d.transition === "continuation").length
  const born = match.decisions.length - continued
  const died = previous.length - match.matchedOldIds.size
  const byDepth: Record<number, { born: number; continued: number }> = {}
  match.decisions.forEach((d, i) => {
    const depth = nodes[i]?.depth ?? 0
    byDepth[depth] ??= { born: 0, continued: 0 }
    if (d.transition === "continuation") byDepth[depth].continued++
    else byDepth[depth].born++
  })

  records.push({
    at: new Date(cursor).toISOString(),
    members: members.length,
    rootChildCount: root.children.length,
    leafCount: nodes.filter((n) => n.children.length === 0).length,
    maxDepth: Math.max(...nodes.map((n) => n.depth), 0),
    born,
    continued,
    died,
    p: previous.length === 0 ? null : Number((continued / (continued + died || 1)).toFixed(4)),
    byDepth,
    durationMs: Number(durationMs.toFixed(1)),
    bestRootSeparation: diagnostics?.bestRootSeparation ?? null,
    warmSeeded: warmPrior?.children.length ?? 0,
    rootSearchKs: (diagnostics as { rootSearchKs?: number } | null)?.rootSearchKs ?? null,
  })

  // Carry this pass's tree forward. Ids only need to be unique per pass — the
  // matcher compares centroids, never names or identities.
  priorTree =
    process.env.TAXONOMY_WARM_PERSISTED === "1"
      ? toPriorPersisted(
          root,
          members.map((m) => new Date(m.time)),
          (i) => embeddingAt(members[i]?.index ?? 0),
          new Date(cursor),
        )
      : toPrior(root)
  const assignedIds = nodes.map(() => `c${previousId++}`)
  const nextLineageOf = new Map<string, string>()
  nodes.forEach((n, i) => {
    const decision = match.decisions[i]
    const inherited = decision?.transition === "continuation" ? lineageOfCluster.get(decision.reuseId) : undefined
    const chain = inherited ?? `L${lineageId++}`
    nextLineageOf.set(assignedIds[i] ?? "", chain)
    const existing = chains.get(chain)
    if (existing) {
      existing.last = passIndex
      existing.passes += 1
      existing.maxMembers = Math.max(existing.maxMembers, n.memberIndices.length)
    } else {
      chains.set(chain, {
        first: passIndex,
        last: passIndex,
        passes: 1,
        maxMembers: n.memberIndices.length,
        depth: n.depth,
      })
    }
  })
  lineageOfCluster.clear()
  for (const [k, v] of nextLineageOf) lineageOfCluster.set(k, v)
  passIndex += 1

  previous = nodes.map((n, i) => ({
    id: assignedIds[i] ?? "",
    depth: n.depth,
    centroid: n.centroid,
    isLeaf: n.children.length === 0,
    childCount: n.children.length,
  }))
  cursor += step
  process.stdout.write(`\r  pass ${records.length}`)
}

await writeFile(join(dir, `replay-${arm}.json`), JSON.stringify(records, null, 2))
await writeFile(
  join(dir, `chains-${arm}.json`),
  JSON.stringify(
    [...chains.entries()].map(([id, c]) => ({ id, ...c })),
    null,
    2,
  ),
)

const withP = records.filter((r) => r.p !== null).map((r) => r.p as number)
const roots = records.map((r) => r.rootChildCount as number)
const leaves = records.map((r) => r.leafCount as number)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
console.log(`\n${records.length} passes → replay-${arm}.json`)
console.log(`  p (continuation)   mean ${mean(withP).toFixed(3)}  min ${Math.min(...withP).toFixed(3)}`)
console.log(
  `  rootChildCount     ${Math.min(...roots)}..${Math.max(...roots)}  spread ${Math.max(...roots) - Math.min(...roots)}  mean ${mean(roots).toFixed(2)}`,
)
console.log(`  leafCount          ${Math.min(...leaves)}..${Math.max(...leaves)}  mean ${mean(leaves).toFixed(2)}`)
console.log(`  build ms           mean ${mean(records.map((r) => r.durationMs as number)).toFixed(0)}`)
