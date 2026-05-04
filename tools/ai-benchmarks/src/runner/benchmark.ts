import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import type { FixtureRow } from "../types.ts"
import { fixtureRowSchema } from "../types.ts"
import type { InspectableFlip, InspectableRow, ReportData } from "../ui/types.ts"
import {
  type Baseline,
  type BaselineDiff,
  diffAgainstBaseline,
  hashRowIds,
  readBaseline,
  selectFailures,
  writeBaseline,
} from "./baseline.ts"
import { computeMetrics, computeMetricsBy, countByPhase, type Prediction } from "./metrics.ts"
import { computeCost } from "./pricing.ts"
import { runTarget } from "./run.ts"
import { stratifiedSample } from "./sample.ts"
import { checkFixtureFreshness, hashMapperFiles, writeFixtureMeta } from "./stale.ts"
import { type BenchmarkTarget, targetPath } from "./targets.ts"

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const FIXTURES_ROOT = join(PKG_ROOT, "fixtures")
const BASELINES_ROOT = join(PKG_ROOT, "baselines")

export type BenchmarkRunPhase =
  | { readonly kind: "fetching-fixture" }
  | { readonly kind: "fixture-fetched"; readonly rowsTotal: number }
  | { readonly kind: "checking-freshness" }
  | { readonly kind: "loading-fixture" }
  | { readonly kind: "fixture-loaded"; readonly rowsTotal: number; readonly sampledFrom: number | null }
  | { readonly kind: "classifying"; readonly rowsDone: number; readonly rowsTotal: number }
  | { readonly kind: "computing-metrics" }
  | { readonly kind: "writing-baseline" }
  | { readonly kind: "done"; readonly report: ReportData }

interface RunBenchmarkOptions {
  readonly sample: number | undefined
  readonly seed: number | undefined
  readonly staleOk: boolean
  readonly updateBaseline: boolean
  readonly concurrency: number | undefined
  readonly onPhase?: (phase: BenchmarkRunPhase) => void
  /**
   * Forwarded to `runTarget`. Used by the optimizer's pre-adoption
   * validation pass to evaluate a freshly-proposed winner candidate
   * without overwriting the strategy file on disk first. See
   * `runTarget`'s `strategyOverride` doc for why this is needed (Node
   * module cache holds the registry strategy across the run).
   */
  readonly strategyOverride?: import("@domain/flaggers").FlaggerStrategy
}

/**
 * In-process benchmark driver. Runs every stage (freshness check, fixture
 * load, classify, metrics, baseline diff/write, ReportData assembly) and
 * emits structured phase events through the optional `onPhase` callback so
 * callers can drive their own progress UI without relying on stdout.
 *
 * No console output and no ink rendering — those concerns live in the CLI
 * wrapper (`benchmark-run.ts`) that calls this. The optimizer calls this
 * directly while keeping its own ink view mounted, so the user sees a live
 * "benchmarking" line instead of a blank terminal during baseline refresh.
 */
export const runBenchmark = async (target: BenchmarkTarget, options: RunBenchmarkOptions): Promise<ReportData> => {
  const onPhase = options.onPhase ?? ((): void => {})

  // Auto-fetch when the local fixture cache is empty. Bootstrapping or
  // working on a fresh checkout shouldn't fail with a "run benchmark:fetch
  // first" error — we run the same logic inline. Staleness (mapper file
  // changed but fixture survived) is *not* auto-refetched: that's a
  // signal the dataset on disk may not match the new mapper schema, and
  // silently re-pulling could mask intentional dataset changes. Use
  // `--stale-ok` to skip the staleness check explicitly, or run
  // `benchmark:fetch` to refresh.
  await fetchFixtureIfMissing(target, onPhase)

  onPhase({ kind: "checking-freshness" })
  await enforceFreshness(target, options.staleOk)

  onPhase({ kind: "loading-fixture" })
  const full = await loadFixture(target)
  const rows = options.sample !== undefined ? stratifiedSample(full, options.sample, options.seed) : full
  const sampled = options.sample !== undefined
  const total = rows.length
  onPhase({
    kind: "fixture-loaded",
    rowsTotal: total,
    sampledFrom: sampled ? full.length : null,
  })

  const runResult = await Effect.runPromise(
    runTarget(target, rows, {
      ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
      ...(options.strategyOverride !== undefined ? { strategyOverride: options.strategyOverride } : {}),
      onProgress: (done) => {
        onPhase({ kind: "classifying", rowsDone: done, rowsTotal: total })
      },
    }),
  )

  onPhase({ kind: "computing-metrics" })
  const predictions = runResult.outcomes.map((o) => o.prediction)
  const metrics = computeMetrics(predictions)
  // Tactic bucketing relies on a shared tag convention: every mapper that
  // has a tactic axis must emit it as a `tactic:<bucket>` tag. The resolver
  // strips the prefix; rows without such a tag collapse into "other". This
  // keeps target.ts free of per-target lists that drift from the mappers.
  const perTactic = computeMetricsBy(predictions, (p) => bucketByTacticPrefix(p.tags))
  const perPhase = countByPhase(predictions)
  const cost = computeCost(target.provider, target.modelId, runResult.usage)

  const baselinePath = join(BASELINES_ROOT, `${targetPath(target.id)}.json`)
  const currentFailures = selectFailures(predictions)
  const currentRowIdsHash = hashRowIds(predictions.map((p) => p.id))
  let baselinePresent = false
  let diff: BaselineDiff | null = null

  if (!sampled) {
    const baseline = await readBaseline(baselinePath)
    if (baseline !== null) {
      baselinePresent = true
      diff = diffAgainstBaseline({
        currentFailures,
        currentFixtureSize: total,
        currentRowIdsHash,
        baseline,
      })
    }
    if (options.updateBaseline) {
      onPhase({ kind: "writing-baseline" })
      const next: Baseline = {
        runAt: new Date().toISOString(),
        metrics,
        perTactic,
        perPhase,
        fixtureSize: total,
        rowIdsHash: currentRowIdsHash,
        failures: currentFailures,
      }
      await writeBaseline(baselinePath, next)
    }
  }

  const rowsById = new Map(rows.map((r) => [r.id, r]))
  const predictionsById = new Map(predictions.map((p) => [p.id, p]))

  const failedRows: InspectableRow[] = predictions
    .filter((p) => p.predicted !== p.expected)
    .map((p) => {
      const row = rowsById.get(p.id)
      if (row === undefined) throw new Error(`missing row ${p.id}`)
      return { row, prediction: p }
    })

  const flippedRows: InspectableFlip[] = diff === null ? [] : buildFlips(diff, rowsById, predictionsById)

  const report: ReportData = {
    targetId: target.id,
    sampled,
    sampleSize: options.sample,
    totalRows: total,
    metrics,
    perTactic,
    perPhase,
    cost,
    baseline: {
      present: baselinePresent,
      addedFailures: diff?.addedFailures.length ?? 0,
      removedFailures: diff?.removedFailures.length ?? 0,
      changedFailures: diff?.changedFailures.length ?? 0,
      fixtureChanged: diff?.fixtureChanged ?? false,
    },
    failedRows,
    flippedRows,
  }

  onPhase({ kind: "done", report })
  return report
}

const TACTIC_TAG_PREFIX = "tactic:"

const bucketByTacticPrefix = (tags: readonly string[]): string => {
  const tag = tags.find((t) => t.startsWith(TACTIC_TAG_PREFIX))
  return tag !== undefined ? tag.slice(TACTIC_TAG_PREFIX.length) : "other"
}

// Fast existence check for both fixture artifacts. We treat "either is
// missing" as "fully missing" — partial state usually means an aborted
// fetch and the safest recovery is to run the full mapper again.
const fixtureArtifactsExist = async (target: BenchmarkTarget): Promise<boolean> => {
  const base = join(FIXTURES_ROOT, targetPath(target.id))
  const jsonlPath = `${base}.jsonl`
  const metaPath = `${base}.meta.json`
  try {
    await Promise.all([stat(jsonlPath), stat(metaPath)])
    return true
  } catch {
    return false
  }
}

const fetchFixtureIfMissing = async (
  target: BenchmarkTarget,
  onPhase: (phase: BenchmarkRunPhase) => void,
): Promise<void> => {
  if (await fixtureArtifactsExist(target)) return

  onPhase({ kind: "fetching-fixture" })
  const rows = await target.mapper()

  const base = join(FIXTURES_ROOT, targetPath(target.id))
  const jsonlPath = `${base}.jsonl`
  const metaPath = `${base}.meta.json`
  await mkdir(dirname(jsonlPath), { recursive: true })

  const jsonl = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`
  await writeFile(jsonlPath, jsonl)

  const mapperHash = await hashMapperFiles(target.mapperSourcePaths)
  await writeFixtureMeta(metaPath, { mapperHash, generatedAt: new Date().toISOString() })

  onPhase({ kind: "fixture-fetched", rowsTotal: rows.length })
}

export const loadFixture = async (target: BenchmarkTarget): Promise<readonly FixtureRow[]> => {
  const path = join(FIXTURES_ROOT, `${targetPath(target.id)}.jsonl`)
  try {
    await stat(path)
  } catch {
    throw new Error(
      `fixture missing for ${target.id}: ${path}\nrun: pnpm --filter @tools/ai-benchmarks benchmark:fetch ${target.id}`,
    )
  }
  const raw = await readFile(path, "utf8")
  const lines = raw.split("\n").filter((l) => l.trim().length > 0)
  return lines.map((line, i) => {
    const parsed = fixtureRowSchema.safeParse(JSON.parse(line))
    if (!parsed.success) {
      throw new Error(`fixture ${target.id} line ${i + 1} failed schema: ${parsed.error.message}`)
    }
    return parsed.data
  })
}

export const enforceFreshness = async (target: BenchmarkTarget, staleOk: boolean): Promise<void> => {
  const metaPath = join(FIXTURES_ROOT, `${targetPath(target.id)}.meta.json`)
  const currentHash = await hashMapperFiles(target.mapperSourcePaths)
  const check = await checkFixtureFreshness(metaPath, currentHash)
  if (check.status === "fresh") return
  if (staleOk) return
  const hint = `run: pnpm --filter @tools/ai-benchmarks benchmark:fetch ${target.id}`
  if (check.status === "no-meta") {
    throw new Error(`[${target.id}] no fixture meta found. ${hint}  (or pass --stale-ok)`)
  }
  throw new Error(
    `[${target.id}] fixture is stale vs current mapper (recorded ${check.recordedHash?.slice(0, 12)} ≠ current ${check.expectedHash.slice(0, 12)}). ${hint}  (or pass --stale-ok)`,
  )
}

/**
 * Order the diff into a single browseable list for the TUI flip view.
 * Added (regressions) first, then changed, then removed (fixes), so a
 * reviewer reads the worst news at the top.
 */
const buildFlips = (
  diff: BaselineDiff,
  rowsById: ReadonlyMap<string, FixtureRow>,
  predictionsById: ReadonlyMap<string, Prediction>,
): InspectableFlip[] => {
  const pickRow = (id: string): FixtureRow => {
    const row = rowsById.get(id)
    if (row === undefined) throw new Error(`missing row ${id}`)
    return row
  }
  const pickPrediction = (id: string): Prediction => {
    const prediction = predictionsById.get(id)
    if (prediction === undefined) throw new Error(`missing prediction ${id}`)
    return prediction
  }

  const added: InspectableFlip[] = diff.addedFailures.map((f) => ({
    kind: "added",
    row: pickRow(f.id),
    prediction: pickPrediction(f.id),
  }))

  const changed: InspectableFlip[] = diff.changedFailures.map((c) => ({
    kind: "changed",
    row: pickRow(c.id),
    prediction: pickPrediction(c.id),
    previous: { predicted: c.was.predicted, phase: c.was.phase },
  }))

  // `removed` rows are baseline failures that no longer fail in the current
  // run. Skip rows whose IDs left the fixture entirely — `diffAgainstBaseline`
  // pushes those into `removedFailures` too, but they have no current row or
  // prediction to display.
  const removed: InspectableFlip[] = diff.removedFailures
    .filter((f) => rowsById.has(f.id) && predictionsById.has(f.id))
    .map((f) => ({
      kind: "removed",
      row: pickRow(f.id),
      prediction: pickPrediction(f.id),
      previous: { predicted: f.predicted, phase: f.phase },
    }))

  return [...added, ...changed, ...removed]
}
