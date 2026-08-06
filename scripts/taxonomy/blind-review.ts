#!/usr/bin/env tsx
/**
 * Build a local, blind, human-reviewable static-vs-adaptive taxonomy comparison.
 *
 * This is the "(a)" quality check behind the shadow-experiment decision. Shape
 * telemetry cannot rank two clusterings that carve the same conversations
 * differently — `@taxonomy.shadow.diff.partitionAri` says they disagree, not
 * which one is right. So run both SHIPPED builders over one project's real
 * production sample, name both trees with the identical production naming
 * procedure, and put them side by side with the labels hidden.
 *
 * Granularity is the LEAF partition, because that is what `partitionAri` scores
 * (shadow-comparison.ts) and it is where the two builders actually disagree: on
 * the projects sampled so far they agree on the root children and differ only
 * about which branches deserve to be split further.
 *
 * BLINDING INTEGRITY: both trees are named fresh in the same run, same prompts,
 * same model, same sampling. Reusing production's existing names for one arm
 * would let a reviewer de-blind on writing style alone.
 *
 * The dump and the report contain REAL CUSTOMER CONVERSATIONS. Keep both outside
 * the repo (default `~/Desktop/taxonomy-blind-review`); never commit or upload
 * them. This script holds no data.
 *
 * Four steps, each resumable:
 *
 *   plan    cluster both arms, score them, choose samples   -> plan.json
 *   name    name every node of both trees via Bedrock       -> names.json
 *   render  fill the blind template's DATA array            -> report.html
 *
 *   pnpm --filter @app/workers exec tsx scripts/taxonomy/blind-review.ts <step> [dumpDir]
 *
 * `plan` expects, per project `<short>` listed in `<dumpDir>/projects.json`:
 *   <short>.f32        row-major float32, L2-normalized, 2048 dims
 *   <short>.meta.json  { rows, dims, observations: [{ observationId, startTime }] }
 *   texts.json         { [observationId]: transcript }
 *
 * Row order must be production's member order, because k-means++ seeds are drawn
 * as indices into the member list — a re-ordered pool builds a different tree.
 * That is the outer ORDER BY of `listForClusteringSample`:
 *
 *   SELECT observation_id, start_time, embedding
 *   FROM taxonomy_observations FINAL
 *   WHERE organization_id = {org} AND project_id = {project}
 *     AND length(observation_id) = 24 AND length(embedding) > 0
 *     AND start_time >= now() - INTERVAL 7 DAY
 *     AND observation_id IN (
 *       SELECT observation_id FROM (
 *         SELECT observation_id,
 *                row_number() OVER (PARTITION BY toDate(start_time)
 *                                   ORDER BY cityHash64(observation_id)) AS rn
 *         FROM taxonomy_observations FINAL WHERE <same predicates>)
 *       ORDER BY rn ASC, observation_id ASC LIMIT 1500)
 *   ORDER BY start_time DESC, observation_id ASC
 *
 * Transcripts come from the same table — `JSONExtractString(projection_metadata,
 * 'summary')`, the user/assistant transcript the embedding was built from. A
 * project whose agent replays a multi-kilobyte pinned preamble into every
 * conversation needs the LAST user turn too, or every example renders as the same
 * quote; supply it as `lastuser.json` and `render` prefers it.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  buildRelativeHierarchicalClusters,
  buildStaticHierarchicalClusters,
} from "../../packages/domain/taxonomy/src/clustering.ts"
import {
  TAXONOMY_ADAPTIVE_ESCALATION_MARGIN,
  TAXONOMY_ADAPTIVE_ESCALATION_MARGIN_FLOOR,
  TAXONOMY_ADAPTIVE_ESCALATION_MAX_WORK,
  TAXONOMY_ADAPTIVE_ESCALATION_SEARCH_WIDTH,
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_DEFAULT_NAMING_MODEL,
  TAXONOMY_FPS_SAMPLE_BUDGET_MAX,
  TAXONOMY_FPS_SAMPLE_BUDGET_MIN,
  TAXONOMY_KMEANS_ESCALATION_RESTARTS,
  TAXONOMY_KMEANS_MAX_ITER,
  TAXONOMY_KMEANS_RESTARTS,
  TAXONOMY_KMEANS_TOLERANCE,
  TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
  TAXONOMY_TREE_STATIC_DEPTH_SCHEDULE,
} from "../../packages/domain/taxonomy/src/constants.ts"
import { farthestPointSample } from "../../packages/domain/taxonomy/src/helpers.ts"

const DUMP_DIR = process.argv[3] ?? join(homedir(), "Desktop/taxonomy-blind-review")
const AWS_PROFILE = process.env.LAT_AWS_PROFILE
const AWS_REGION = process.env.LAT_AWS_REGION ?? "eu-central-1"
/** Candidates, not the final five — near-duplicate transcripts get filtered at render. */
const EXAMPLE_CANDIDATES = 60
const EXAMPLES_SHOWN = 5
const EXAMPLE_CHARS = 320
/** The stored transcript is already middle-truncated; this keeps a 12-sample prompt sane. */
const SAMPLE_CHARS = 4000

interface Node {
  readonly memberIndices: readonly number[]
  readonly children: readonly Node[]
  readonly depth: number
}

interface ProjectRef {
  readonly short: string
  readonly project: string
  readonly org: string
}

const file = (name: string): string => join(DUMP_DIR, name)
const readJson = <T>(name: string): T => JSON.parse(readFileSync(file(name), "utf8")) as T
const writeJson = (name: string, value: unknown): void => writeFileSync(file(name), JSON.stringify(value))

/** build-hierarchical-taxonomy.ts:341-349 — verbatim. */
const seedFromProjectId = (projectId: string): number => {
  let hash = 0
  for (let index = 0; index < projectId.length; index++)
    hash = (Math.imul(hash, 31) + projectId.charCodeAt(index)) >>> 0
  return hash === 0 ? 0x9e3779b9 : hash
}

/** runTaxonomyClusterBuild (build-hierarchical-taxonomy.ts:166-197) for both modes at once. */
const buildBoth = (embeddings: number[][], seed: number): { static: Node; adaptive: Node } => ({
  static: buildStaticHierarchicalClusters({
    embeddings,
    depthSchedule: TAXONOMY_TREE_STATIC_DEPTH_SCHEDULE,
    restarts: TAXONOMY_KMEANS_RESTARTS,
    maxIter: TAXONOMY_KMEANS_MAX_ITER,
    tolerance: TAXONOMY_KMEANS_TOLERANCE,
    seed,
  }) as Node,
  adaptive: buildRelativeHierarchicalClusters({
    embeddings,
    depthSchedule: TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
    restarts: TAXONOMY_KMEANS_RESTARTS,
    maxIter: TAXONOMY_KMEANS_MAX_ITER,
    tolerance: TAXONOMY_KMEANS_TOLERANCE,
    seed,
    globalAbsoluteThreshold: TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
    escalation: {
      restarts: TAXONOMY_KMEANS_ESCALATION_RESTARTS,
      marginThreshold: TAXONOMY_ADAPTIVE_ESCALATION_MARGIN,
      marginFloor: TAXONOMY_ADAPTIVE_ESCALATION_MARGIN_FLOOR,
      searchWidth: TAXONOMY_ADAPTIVE_ESCALATION_SEARCH_WIDTH,
      maxSearchWork: TAXONOMY_ADAPTIVE_ESCALATION_MAX_WORK,
    },
  }).root as Node,
})

const dot = (a: number[], b: number[]): number => {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] as number) * (b[i] as number)
  return sum
}

const centroidOf = (rows: number[][], members: readonly number[]): number[] => {
  const dims = (rows[0] as number[]).length
  const mean = new Array<number>(dims).fill(0)
  for (const index of members) {
    const row = rows[index] as number[]
    for (let d = 0; d < dims; d++) mean[d] = (mean[d] as number) + (row[d] as number)
  }
  let norm = 0
  for (let d = 0; d < dims; d++) {
    mean[d] = (mean[d] as number) / members.length
    norm += (mean[d] as number) ** 2
  }
  norm = Math.sqrt(norm) || 1
  for (let d = 0; d < dims; d++) mean[d] = (mean[d] as number) / norm
  return mean
}

/** shadow-comparison.ts:66-81 — the partition `partitionAri` scores. */
const leafPartitionLabels = (root: Node, sampleSize: number): number[] => {
  const labels = new Array<number>(Math.max(0, sampleSize)).fill(-1)
  let leafOrdinal = 0
  const visit = (node: Node): void => {
    if (node.children.length === 0) {
      for (const index of node.memberIndices) if (index >= 0 && index < labels.length) labels[index] = leafOrdinal
      leafOrdinal++
      return
    }
    for (const child of node.children) visit(child)
  }
  visit(root)
  return labels
}

/** Leaf paths in the order `leafPartitionLabels` numbers them, so xtab indices line up. */
const leafPaths = (root: Node): string[] => {
  const out: string[] = []
  const visit = (node: Node, path: string): void => {
    if (node.children.length === 0) {
      out.push(path)
      return
    }
    node.children.forEach((child, index) => {
      visit(child, `${path}.${index}`)
    })
  }
  visit(root, "r")
  return out
}

const adjustedRandIndex = (a: number[], b: number[]): number => {
  const cells = new Map<string, number>()
  const rowTotals = new Map<number, number>()
  const colTotals = new Map<number, number>()
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number
    const y = b[i] as number
    cells.set(`${x}|${y}`, (cells.get(`${x}|${y}`) ?? 0) + 1)
    rowTotals.set(x, (rowTotals.get(x) ?? 0) + 1)
    colTotals.set(y, (colTotals.get(y) ?? 0) + 1)
  }
  const choose2 = (n: number): number => (n * (n - 1)) / 2
  const index = [...cells.values()].reduce((sum, n) => sum + choose2(n), 0)
  const aSum = [...rowTotals.values()].reduce((sum, n) => sum + choose2(n), 0)
  const bSum = [...colTotals.values()].reduce((sum, n) => sum + choose2(n), 0)
  const expected = (aSum * bSum) / choose2(a.length)
  const max = (aSum + bSum) / 2
  return max === expected ? 1 : (index - expected) / (max - expected)
}

/**
 * Mean cosine silhouette over a partition; rows are L2-normalized so cosine
 * distance is `1 - dot`. Null below two non-empty groups. Compare across arms
 * only with the cluster counts in view — silhouette rewards coarser partitions,
 * so a 2-group tree can outscore an 8-group one that is more useful.
 */
const silhouette = (rows: number[][], labels: number[]): number | null => {
  const groups = new Map<number, number[]>()
  labels.forEach((label, index) => {
    if (label < 0) return
    const bucket = groups.get(label) ?? []
    bucket.push(index)
    groups.set(label, bucket)
  })
  if (groups.size < 2) return null
  const keys = [...groups.keys()]
  let total = 0
  let counted = 0
  for (const own of keys) {
    const members = groups.get(own) as number[]
    for (const index of members) {
      const row = rows[index] as number[]
      if (members.length < 2) {
        counted++
        continue
      }
      let a = 0
      for (const other of members) if (other !== index) a += 1 - dot(row, rows[other] as number[])
      a /= members.length - 1
      let b = Number.POSITIVE_INFINITY
      for (const key of keys) {
        if (key === own) continue
        const outside = groups.get(key) as number[]
        let sum = 0
        for (const other of outside) sum += 1 - dot(row, rows[other] as number[])
        b = Math.min(b, sum / outside.length)
      }
      total += (b - a) / Math.max(a, b)
      counted++
    }
  }
  return counted === 0 ? null : total / counted
}

/** name-taxonomy.ts:62-65 — verbatim. */
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)
const sampleBudget = (count: number): number =>
  Math.round(
    clamp(Math.round(Math.log2(count + 1)) * 2, TAXONOMY_FPS_SAMPLE_BUDGET_MIN, TAXONOMY_FPS_SAMPLE_BUDGET_MAX),
  )

const loadPool = (short: string): { rows: number[][]; observations: { observationId: string }[] } => {
  const meta = readJson<{ rows: number; dims: number; observations: { observationId: string }[] }>(`${short}.meta.json`)
  const buf = readFileSync(file(`${short}.f32`))
  const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  const rows: number[][] = []
  for (let r = 0; r < meta.rows; r++) rows.push(Array.from(floats.subarray(r * meta.dims, (r + 1) * meta.dims)))
  return { rows, observations: meta.observations }
}

const plan = (): void => {
  const projects = readJson<ProjectRef[]>("projects.json")
  const out: Record<string, unknown>[] = []
  for (const p of projects) {
    const { rows, observations } = loadPool(p.short)
    const trees = buildBoth(rows, seedFromProjectId(p.project))
    const entry: Record<string, unknown> = { ...p, obs: rows.length }

    for (const arm of ["static", "adaptive"] as const) {
      const root = trees[arm]
      const nodes: unknown[] = []
      const walk = (node: Node, path: string, parentPath: string | null): void => {
        const members = node.memberIndices
        const centroid = centroidOf(rows, members)
        const nearest = [...members]
          .map((index) => ({ index, sim: dot(rows[index] as number[], centroid) }))
          .sort((a, b) => b.sim - a.sim)
          .slice(0, EXAMPLE_CANDIDATES)
          .map((m) => observations[m.index]?.observationId as string)
        const fps = farthestPointSample(
          members.map((index) => rows[index] as number[]),
          sampleBudget(members.length),
        ).map((local) => observations[members[local] as number]?.observationId as string)
        nodes.push({
          path,
          depth: node.depth,
          n: members.length,
          isLeaf: node.children.length === 0,
          parentPath,
          childPaths: node.children.map((_, index) => `${path}.${index}`),
          namingObservationIds: fps,
          exampleObservationIds: nearest,
        })
        node.children.forEach((child, index) => {
          walk(child, `${path}.${index}`, path)
        })
      }
      walk(root, "r", null)
      const labels = leafPartitionLabels(root, rows.length)
      entry[arm] = { nodes, leafPaths: leafPaths(root), leafLabels: labels, silhouette: silhouette(rows, labels) }
    }

    const staticLabels = (entry.static as { leafLabels: number[] }).leafLabels
    const adaptiveLabels = (entry.adaptive as { leafLabels: number[] }).leafLabels
    const staticLeaves = (entry.static as { leafPaths: string[] }).leafPaths.length
    const adaptiveLeaves = (entry.adaptive as { leafPaths: string[] }).leafPaths.length
    const xtab = Array.from({ length: staticLeaves }, () => new Array<number>(adaptiveLeaves).fill(0))
    for (let i = 0; i < rows.length; i++) {
      const s = staticLabels[i] as number
      const a = adaptiveLabels[i] as number
      if (s >= 0 && a >= 0) (xtab[s] as number[])[a] = ((xtab[s] as number[])[a] as number) + 1
    }
    entry.xtab = xtab
    entry.leafAri = adjustedRandIndex(staticLabels, adaptiveLabels)

    out.push(entry)
    console.log(
      `${p.short.padEnd(6)} n=${String(rows.length).padStart(4)} leaves ${staticLeaves} vs ${adaptiveLeaves} ` +
        `leafARI=${(entry.leafAri as number).toFixed(3)} ` +
        `sil ${((entry.static as { silhouette: number }).silhouette ?? Number.NaN).toFixed(3)} / ` +
        `${((entry.adaptive as { silhouette: number }).silhouette ?? Number.NaN).toFixed(3)}`,
    )
  }
  writeJson("plan.json", out)
  console.log(`\nwrote ${file("plan.json")}`)
}

// --- naming: name-taxonomy.ts, verbatim strings ------------------------------

const TOPIC_POLICY =
  "Conversation topic clusters describe what users come to do (e.g. 'Order Status', 'Returns and Refunds', 'Account Billing'). They are NOT conversational rituals (no 'user greets', 'user thanks', 'user says hello'), NOT model behaviours (no 'agent apologizes'), and NOT generic dispositions ('frustrated user'). If samples disagree, name the dominant topic of the conversation transcripts."
const SUBJECT_LABEL = "TOPIC"
const DESCRIPTION_CLAUSE = "of what the user is trying to do"
const MODE_CONTEXT: Record<string, string> = {
  leaf: "These are raw conversation samples. Find the dominant topic across them.",
  root: "These are NOT raw conversation samples — they are the names and descriptions of the TOP-LEVEL categories in this entire project's taxonomy. Your job is to produce a SHORT umbrella label that captures the WHOLE project. It MUST cover EVERY listed top-level category — never name something that fits one branch but excludes the others. A correct label feels like 'Customer Support Conversations', 'Internal Helpdesk Tickets', or '<Company> Customer Interactions' — broad and category-neutral. The label must not be identical to or paraphrase any listed category.",
  interior: `These are NOT raw conversation samples — they are the names and descriptions of THIS cluster's CHILD topics. Your job is to find a single short umbrella ${SUBJECT_LABEL} that subsumes all of them and is BROADER than every child. The umbrella must not be identical or near-identical to any child.`,
}

/**
 * Neutralize agent-protocol markup before a transcript becomes a sample.
 *
 * These are real agent sessions, so a transcript can contain literal tool-call
 * tags. Fed back verbatim they pull the namer into emitting a tool call instead
 * of JSON, deterministically — retrying does not shake it loose. Escaping the
 * brackets keeps every topic word and removes the protocol.
 */
const defang = (text: string): string => text.replaceAll("<", "‹").replaceAll(">", "›")

const converse = (system: string, prompt: string, temperature: number): string => {
  const payload = {
    modelId: TAXONOMY_DEFAULT_NAMING_MODEL.model,
    messages: [{ role: "user", content: [{ text: prompt }] }],
    system: [{ text: system }],
    inferenceConfig: { temperature, maxTokens: TAXONOMY_DEFAULT_NAMING_MODEL.maxTokens },
  }
  const args = ["bedrock-runtime", "converse", "--region", AWS_REGION, "--cli-input-json", JSON.stringify(payload)]
  if (AWS_PROFILE) args.push("--profile", AWS_PROFILE)
  const body = JSON.parse(execFileSync("aws", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })) as {
    output: { message: { content: { text?: string }[] } }
  }
  // Reasoning models emit a reasoningContent block ahead of the text block.
  return body.output.message.content.map((part) => part.text ?? "").join("")
}

const parseJson = (raw: string): Record<string, unknown> => {
  const object = raw.match(/\{[\s\S]*\}/)
  if (object) return JSON.parse(object[0]) as Record<string, unknown>
  // The map call sometimes answers with a bare array of themes; the reduce call
  // only ever reads them back as text, so normalize rather than burn a retry.
  const array = raw.match(/\[[\s\S]*\]/)
  if (array) return { candidates: JSON.parse(array[0]) as unknown }
  throw new Error(`no JSON in: ${raw.slice(0, 200)}`)
}

/**
 * Retry unparseable output the way the AI SDK retries a schema violation, but
 * escalate temperature: at 0.2 a transcript that derails the namer derails it
 * identically every time, so a same-temperature retry is not a retry at all.
 */
const structured = (system: string, prompt: string): Record<string, unknown> => {
  let last: unknown = null
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return parseJson(converse(system, prompt, Math.min(TAXONOMY_DEFAULT_NAMING_MODEL.temperature + 0.2 * attempt, 1)))
    } catch (error) {
      last = error
    }
  }
  throw new Error(`unparseable after retries: ${String(last)}`)
}

const generate = (
  mode: string,
  samples: string[],
  forbidden: string[],
  retryForbiddenName: string | null,
): { name: string; description: string } => {
  const sampleLines = samples.map((sample, index) => `${index}: ${sample}`).join("\n")
  const unique = [...new Set(forbidden.filter((name) => name.trim().length > 0))]
  const forbiddenContext =
    unique.length > 0
      ? `FORBIDDEN names — your "name" field must not match or paraphrase any of these (they're already used by the parent, siblings, or your own children):\n${unique.map((name) => `- ${name}`).join("\n")}\n\n`
      : ""
  const retryContext = retryForbiddenName
    ? `Previous attempt returned "${retryForbiddenName}" which is forbidden. Pick a DIFFERENT name.\n\n`
    : ""
  const ctx = MODE_CONTEXT[mode] as string

  const map = structured(
    `proposeCandidateThemes: propose concise candidate conversation ${SUBJECT_LABEL} themes for this cluster. ${TOPIC_POLICY} ${ctx} Return only schema-valid JSON.`,
    `${forbiddenContext}${retryContext}Samples:\n${sampleLines}`,
  )
  return structured(
    `Collapse candidate themes into ONE conversation ${SUBJECT_LABEL} name (2-5 words) and a one-sentence description ${DESCRIPTION_CLAUSE}. ${TOPIC_POLICY} ${ctx} The name MUST be clearly distinct from any forbidden names provided. Return only schema-valid JSON with BOTH required string keys: name and description.`,
    `${forbiddenContext}${retryContext}Samples:\n${sampleLines}\n\nCandidates:\n${JSON.stringify(map.candidates ?? [])}\n\nReturn JSON exactly like {"name":"Short topic label","description":"One sentence describing what these conversations are about."}`,
  ) as unknown as { name: string; description: string }
}

const normalizeName = (name: string): string => name.replace(/\s+/g, " ").trim().toLowerCase()

const nameNode = (mode: string, samples: string[], forbidden: string[]): { name: string; description: string } => {
  const result = generate(mode, samples, forbidden, null)
  const banned = new Set(forbidden.map(normalizeName))
  if (!banned.has(normalizeName(result.name))) return result
  const retry = generate(mode, samples, forbidden, result.name)
  return banned.has(normalizeName(retry.name)) ? { ...retry, name: `${retry.name} (subtopic)` } : retry
}

interface PlanNodeRow {
  path: string
  depth: number
  n: number
  isLeaf: boolean
  parentPath: string | null
  childPaths: string[]
  namingObservationIds: string[]
  exampleObservationIds: string[]
}

const nameTrees = (): void => {
  const planned = readJson<Record<string, unknown>[]>("plan.json")
  const texts = readJson<Record<string, string>>("texts.json")
  const selected = new Set(
    existsSync(file("selected.json")) ? readJson<string[]>("selected.json") : planned.map((p) => p.short as string),
  )
  const names: Record<string, { name: string; description: string }> = existsSync(file("names.json"))
    ? readJson("names.json")
    : {}

  for (const project of planned) {
    const short = project.short as string
    if (!selected.has(short)) continue
    for (const arm of ["static", "adaptive"] as const) {
      const rows = (project[arm] as { nodes: PlanNodeRow[] }).nodes
      const byPath = new Map(rows.map((node) => [node.path, node]))
      // Deepest-first, the order the gardening workflow names in, so every node
      // sees its already-named children and siblings.
      for (const node of [...rows].sort((a, b) => b.depth - a.depth)) {
        const key = `${short}:${arm}:${node.path}`
        if (names[key]) continue
        let mode: string
        let samples: string[]
        if (node.isLeaf) {
          mode = "leaf"
          samples = node.namingObservationIds
            .filter((id) => texts[id] !== undefined)
            .map((id) => defang((texts[id] as string).slice(0, SAMPLE_CHARS)))
        } else {
          mode = node.parentPath === null ? "root" : "interior"
          const children = node.childPaths.map((path) => byPath.get(path) as PlanNodeRow)
          const limit = sampleBudget(children.reduce((sum, child) => sum + child.n, 0))
          samples = children.slice(0, limit).map((child) => {
            const named = names[`${short}:${arm}:${child.path}`]
            return `${named?.name ?? "Unnamed"}: ${named?.description ?? ""}`
          })
        }
        const forbidden = [
          ...rows.filter((s) => s.parentPath === node.parentPath && s.path !== node.path).map((s) => s.path),
          ...node.childPaths,
        ].flatMap((path) => {
          const named = names[`${short}:${arm}:${path}`]
          return named ? [named.name] : []
        })
        names[key] = nameNode(mode, samples, forbidden)
        writeJson("names.json", names)
        console.log(`  ${short}/${arm} ${node.path} (n=${node.n}) -> ${names[key]?.name}`)
      }
    }
  }
  console.log(`\nwrote ${file("names.json")} — ${Object.keys(names).length} nodes`)
}

// --- render ------------------------------------------------------------------

// Bullet keys use an ASCII or a full-width colon depending on the writer's locale.
const BOILERPLATE = /^\s*(?:gs:\/\/\S+|https?:\/\/\S+|#+ .*|-\s*\*\*[^*]+\*\*\s*[:：].*|-\s*\d{4}-\d{2}-\d{2}\s*)\s*$/
// Pinned context an agent replays into every conversation in the project.
const PREAMBLE_BLOCK = /<(global_memory|system_context|memory)>[\s\S]*?<\/\1>/g

const render = (): void => {
  const templatePath = process.argv[4]
  if (!templatePath) throw new Error("render needs the blind template path as the 4th argument")
  const planned = readJson<Record<string, unknown>[]>("plan.json")
  const texts = readJson<Record<string, string>>("texts.json")
  const lastUser = existsSync(file("lastuser.json")) ? readJson<Record<string, string>>("lastuser.json") : {}
  const names = readJson<Record<string, { name: string }>>("names.json")
  const selected = new Set(
    existsSync(file("selected.json")) ? readJson<string[]>("selected.json") : planned.map((p) => p.short as string),
  )

  const snippet = (observationId: string): string => {
    // An empty last-turn extraction must fall back, not blank the example out.
    const source = lastUser[observationId] || texts[observationId] || ""
    const raw = source.replace(PREAMBLE_BLOCK, "")
    const body = raw.startsWith("user: ") ? raw.slice("user: ".length) : raw
    const lines = body.split("\n").map((line) => line.trim())
    const kept = lines.filter((line) => line && !BOILERPLATE.test(line) && !line.startsWith("[...truncated"))
    const text = (kept.length > 0 ? kept : lines.filter(Boolean)).join(" ").replace(/\s+/g, " ").trim()
    return text.length > EXAMPLE_CHARS ? `${text.slice(0, EXAMPLE_CHARS).trimEnd()}…` : text
  }

  const data = planned
    .filter((project) => selected.has(project.short as string))
    .map((project) => {
      const short = project.short as string
      const entry: Record<string, unknown> = {
        id: project.project,
        obs: project.obs,
        silStatic: Number(((project.static as { silhouette: number }).silhouette ?? 0).toFixed(3)),
        silAdaptive: Number(((project.adaptive as { silhouette: number }).silhouette ?? 0).toFixed(3)),
        xtab: project.xtab,
      }
      for (const arm of ["static", "adaptive"] as const) {
        const armPlan = project[arm] as { nodes: PlanNodeRow[]; leafPaths: string[] }
        const byPath = new Map(armPlan.nodes.map((node) => [node.path, node]))
        entry[arm] = armPlan.leafPaths.map((path) => {
          const node = byPath.get(path) as PlanNodeRow
          // Farthest-point sample first, then the centroid-ranked list. Straight
          // nearest-to-centroid picks five mutual neighbours, and in projects that
          // run the same scheduled job repeatedly those are near-identical — five
          // copies of one quote say nothing about the grouping. FPS is seeded at
          // the closest-to-centroid member, so the first example is still the most
          // typical one, and it is exactly the sample the namer saw.
          const examples: string[] = []
          const seen = new Set<string>()
          for (const id of [...node.namingObservationIds, ...node.exampleObservationIds]) {
            const text = snippet(id)
            const key = text.slice(0, 140).toLowerCase()
            if (!text || seen.has(key)) continue
            seen.add(key)
            examples.push(text)
            if (examples.length === EXAMPLES_SHOWN) break
          }
          return { name: names[`${short}:${arm}:${path}`]?.name ?? "Unnamed", n: node.n, ex: examples }
        })
      }
      return entry
    })

  const template = readFileSync(templatePath, "utf8")
  const start = template.indexOf("const DATA=[")
  const end = template.indexOf("];", start) + 2
  const filled = `${template.slice(0, start)}const DATA=${JSON.stringify(data)};${template.slice(end)}`.replace(
    /Mock data — layout preview only\.[^<]*/,
    "Real production conversations, generated locally. This file must not be committed, uploaded, or shared. " +
      "Behaviours are each tree's leaf groups — the partition @taxonomy.shadow.diff.partitionAri scores. Both trees " +
      "were named fresh in one run with the identical production naming procedure, so naming style cannot de-blind them.",
  )
  writeFileSync(file("report.html"), filled)
  console.log(`wrote ${file("report.html")} — ${data.length} projects`)
}

const step = process.argv[2]
if (step === "plan") plan()
else if (step === "name") nameTrees()
else if (step === "render") render()
else {
  console.error("usage: blind-review.ts <plan|name|render> [dumpDir] [templatePath]")
  process.exit(1)
}
