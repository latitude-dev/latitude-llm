import { readFile, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { Effect } from "effect"
import { render } from "ink"
import { Listr } from "listr2"
import { createElement } from "react"
import {
  type Baseline,
  type BaselineDiff,
  diffAgainstBaseline,
  hashRowIds,
  readBaseline,
  selectFailures,
  writeBaseline,
} from "../runner/baseline.ts"
import { computeMetrics, computeMetricsBy, countByPhase, type Prediction } from "../runner/metrics.ts"
import { computeCost } from "../runner/pricing.ts"
import { runTarget } from "../runner/run.ts"
import { stratifiedSample } from "../runner/sample.ts"
import { checkFixtureFreshness, hashMapperFile } from "../runner/stale.ts"
import { type BenchmarkTarget, resolveTargets, targetPath } from "../runner/targets.ts"
import { type FixtureRow, fixtureRowSchema } from "../types.ts"
import { formatCostUsd, formatPercent } from "../ui/format.ts"
import { Report } from "../ui/Report.tsx"
import type { InspectableFlip, InspectableRow, ReportData } from "../ui/types.ts"

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const FIXTURES_ROOT = join(PKG_ROOT, "fixtures")
const BASELINES_ROOT = join(PKG_ROOT, "baselines")

interface RunOneOptions {
  readonly sample: number | undefined
  readonly seed: number | undefined
  readonly staleOk: boolean
  readonly updateBaseline: boolean
  readonly concurrency: number | undefined
}

interface ListrCtx {
  rows?: readonly FixtureRow[]
  report?: ReportData
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

async function loadFixture(target: BenchmarkTarget): Promise<readonly FixtureRow[]> {
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

async function enforceFreshness(target: BenchmarkTarget, staleOk: boolean): Promise<void> {
  const metaPath = join(FIXTURES_ROOT, `${targetPath(target.id)}.meta.json`)
  const currentHash = await hashMapperFile(target.mapperSourcePath)
  const check = await checkFixtureFreshness(metaPath, currentHash)
  if (check.status === "fresh") return
  if (staleOk) return // warning was enough; listr2 task title already shows status
  const hint = `run: pnpm --filter @tools/ai-benchmarks benchmark:fetch ${target.id}`
  if (check.status === "no-meta") {
    throw new Error(`[${target.id}] no fixture meta found. ${hint}  (or pass --stale-ok)`)
  }
  throw new Error(
    `[${target.id}] fixture is stale vs current mapper (recorded ${check.recordedHash?.slice(0, 12)} ≠ current ${check.expectedHash.slice(0, 12)}). ${hint}  (or pass --stale-ok)`,
  )
}

/**
 * Drive one target's benchmark via a listr2 task tree. Each task updates its
 * own title so the terminal shows progress. On the final task the aggregated
 * ReportData is attached to ctx for the caller to hand off to the ink TUI.
 */
function makeListr(target: BenchmarkTarget, options: RunOneOptions): Listr<ListrCtx> {
  return new Listr<ListrCtx>(
    [
      {
        title: `[${target.id}] check fixture freshness`,
        task: async () => {
          await enforceFreshness(target, options.staleOk)
        },
      },
      {
        title: `[${target.id}] load fixture`,
        task: async (ctx, task) => {
          const full = await loadFixture(target)
          const rows = options.sample !== undefined ? stratifiedSample(full, options.sample, options.seed) : full
          ctx.rows = rows
          task.title = `[${target.id}] loaded ${rows.length} rows${options.sample !== undefined ? ` (sample of ${full.length})` : ""}`
        },
      },
      {
        title: `[${target.id}] classify rows`,
        task: async (ctx, task) => {
          if (ctx.rows === undefined) throw new Error("rows missing — previous task failed silently?")
          const rows = ctx.rows
          const total = rows.length
          const runResult = await Effect.runPromise(
            runTarget(target, rows, {
              ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
              onProgress: (done) => {
                task.title = `[${target.id}] classified ${done}/${total} rows`
              },
            }),
          )

          const predictions = runResult.outcomes.map((o) => o.prediction)
          const metrics = computeMetrics(predictions)
          const perTactic = computeMetricsBy(predictions, (p) => {
            const tacticLike = p.tags.find((t) =>
              ["persona-aim", "fictional-framing", "adversarial-suffix", "jbb-benign", "jbb-harmful-direct"].includes(
                t,
              ),
            )
            return (tacticLike ?? "other") as string
          })
          const perPhase = countByPhase(predictions)
          const cost = computeCost(target.provider, target.modelId, runResult.usage)

          const sampled = options.sample !== undefined
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

          ctx.report = {
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

          task.title = `[${target.id}] classified ${total}/${total} rows — f1=${formatPercent(metrics.f1)} · ${formatCostUsd(cost.totalUsd)}`
        },
      },
    ],
    { concurrent: false, rendererOptions: { collapseSubtasks: false } },
  )
}

/**
 * Order the diff into a single browseable list for the TUI flip view.
 * Added (regressions) first, then changed, then removed (fixes), so a
 * reviewer reads the worst news at the top.
 */
function buildFlips(
  diff: BaselineDiff,
  rowsById: ReadonlyMap<string, FixtureRow>,
  predictionsById: ReadonlyMap<string, Prediction>,
): InspectableFlip[] {
  const pickRow = (id: string): FixtureRow => {
    const row = rowsById.get(id)
    if (row === undefined) throw new Error(`missing row ${id}`)
    return row
  }
  const pickPrediction = (id: string) => {
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
  // run. Their current prediction is a passing one; we still surface it so
  // the reviewer sees the new (correct) phase next to the baseline state.
  // Skip rows whose IDs left the fixture entirely — `diffAgainstBaseline`
  // pushes those into `removedFailures` too (any baseline ID absent from
  // the current run's failure set), but they have no current row or
  // prediction to display, so attempting to look them up would crash. The
  // `fixtureChanged` banner already accounts for this case at the report
  // level.
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

/**
 * Print a one-line summary AFTER the ink TUI exits, so the terminal
 * scrollback carries the numbers even when the interactive view is gone.
 */
function printPersistentLine(data: ReportData): void {
  const m = data.metrics
  const sampleSuffix = data.sampled ? ` sample=${data.sampleSize}` : ""
  // In sample mode we explicitly skip the baseline diff, so don't falsely
  // report "no baseline" — a baseline may well exist; we just didn't compare.
  const baselineSummary = data.sampled
    ? "baseline skipped (sample)"
    : data.baseline.present
      ? `+${data.baseline.addedFailures}/Δ${data.baseline.changedFailures}/-${data.baseline.removedFailures} vs baseline${data.baseline.fixtureChanged ? " (fixture changed)" : ""}`
      : "no baseline"
  console.log(
    `[${data.targetId}${sampleSuffix}] p=${formatPercent(m.precision)} r=${formatPercent(m.recall)} f1=${formatPercent(m.f1)} · cost=${formatCostUsd(data.cost.totalUsd)} · ${data.failedRows.length} failed, ${baselineSummary}`,
  )
}

async function runOne(target: BenchmarkTarget, options: RunOneOptions): Promise<void> {
  const tasks = makeListr(target, options)
  const ctx = await tasks.run()
  if (ctx.report === undefined) return
  if (options.updateBaseline) {
    console.log(`[${target.id}] baseline updated at baselines/${targetPath(target.id)}.json`)
  }

  const app = render(createElement(Report, { data: ctx.report }))
  await app.waitUntilExit()
  printPersistentLine(ctx.report)
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      only: { type: "string" },
      except: { type: "string" },
      sample: { type: "string" },
      seed: { type: "string" },
      concurrency: { type: "string" },
      "update-baseline": { type: "boolean", default: false },
      "stale-ok": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(`usage: pnpm --filter @tools/ai-benchmarks benchmark:run [options]

  --only <ids>          comma-separated target ids or globs (e.g. 'flaggers:*')
  --except <ids>        comma-separated targets to exclude
  --sample <N>          stratified sample of N rows (deterministic seed)
  --seed <n>            PRNG seed for --sample (default 0xbeefcafe)
  --concurrency <N>     in-flight classifier calls (default 4; bump only if
                        your Bedrock quota can handle it — saturation triggers
                        ThrottlingException which surfaces as 'error' phase rows)
  --update-baseline     overwrite baselines with current predictions (not allowed with --sample)
  --stale-ok            skip fixture staleness check
`)
    return
  }

  const only = parseCsv(values.only)
  const except = parseCsv(values.except)
  // `Number()` accepts both decimal and `0x…` hex literals, matching the
  // default seed shown in `--help` (`0xbeefcafe`). `parseInt(_, 10)` would
  // silently parse `0xbeefcafe` as 0 — a reproducible but confusing bug.
  const sample = values.sample !== undefined ? Number(values.sample) : undefined
  const seed = values.seed !== undefined ? Number(values.seed) : undefined
  const concurrency = values.concurrency !== undefined ? Number(values.concurrency) : undefined
  const updateBaseline = values["update-baseline"] === true
  const staleOk = values["stale-ok"] === true

  if (sample !== undefined && updateBaseline) {
    throw new Error("--update-baseline is incompatible with --sample (sampled runs are not a complete benchmark)")
  }
  if (sample !== undefined && (!Number.isInteger(sample) || sample <= 0)) {
    throw new Error(`--sample must be a positive integer (got "${values.sample}")`)
  }
  if (concurrency !== undefined && (!Number.isInteger(concurrency) || concurrency <= 0)) {
    throw new Error(`--concurrency must be a positive integer (got "${values.concurrency}")`)
  }
  if (seed !== undefined && sample === undefined) {
    throw new Error("--seed is only meaningful with --sample (it reseeds the sampling PRNG)")
  }

  const targets = resolveTargets(only, except)
  if (targets.length === 0) {
    throw new Error("no targets selected — check your --only / --except selectors")
  }

  for (const target of targets) {
    await runOne(target, { sample, seed, staleOk, updateBaseline, concurrency })
  }
}

await main()
