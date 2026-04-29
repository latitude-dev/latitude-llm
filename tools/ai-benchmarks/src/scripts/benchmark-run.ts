import { parseArgs } from "node:util"
import { render } from "ink"
import { Listr } from "listr2"
import { createElement } from "react"
import { runBenchmark } from "../runner/benchmark.ts"
import { type BenchmarkTarget, resolveTargets, targetPath } from "../runner/targets.ts"
import { formatCostUsd, formatPercent } from "../ui/format.ts"
import { Report } from "../ui/Report.tsx"
import type { ReportData } from "../ui/types.ts"

interface RunOneOptions {
  readonly sample: number | undefined
  readonly seed: number | undefined
  readonly staleOk: boolean
  readonly updateBaseline: boolean
  readonly concurrency: number | undefined
}

interface ListrCtx {
  report?: ReportData
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Drive one target's benchmark via a single listr2 task that subscribes to
 * runBenchmark's onPhase callback and updates its title as work progresses.
 * The aggregated ReportData lands on ctx for the caller to hand off to ink.
 */
function makeListr(target: BenchmarkTarget, options: RunOneOptions): Listr<ListrCtx> {
  return new Listr<ListrCtx>(
    [
      {
        title: `[${target.id}] starting`,
        task: async (ctx, task) => {
          ctx.report = await runBenchmark(target, {
            ...options,
            onPhase: (phase) => {
              switch (phase.kind) {
                case "fetching-fixture":
                  task.title = `[${target.id}] fetching dataset (no local fixture yet)`
                  break
                case "fixture-fetched":
                  task.title = `[${target.id}] fetched ${phase.rowsTotal} rows`
                  break
                case "checking-freshness":
                  task.title = `[${target.id}] checking fixture freshness`
                  break
                case "loading-fixture":
                  task.title = `[${target.id}] loading fixture`
                  break
                case "fixture-loaded":
                  task.title = `[${target.id}] loaded ${phase.rowsTotal} rows${phase.sampledFrom !== null ? ` (sample of ${phase.sampledFrom})` : ""}`
                  break
                case "classifying":
                  task.title = `[${target.id}] classified ${phase.rowsDone}/${phase.rowsTotal} rows`
                  break
                case "computing-metrics":
                  task.title = `[${target.id}] computing metrics`
                  break
                case "writing-baseline":
                  task.title = `[${target.id}] writing baseline`
                  break
                case "done": {
                  const { metrics, totalRows, cost } = phase.report
                  task.title = `[${target.id}] classified ${totalRows}/${totalRows} rows — f1=${formatPercent(metrics.f1)} · ${formatCostUsd(cost.totalUsd)}`
                  break
                }
              }
            },
          })
        },
      },
    ],
    { concurrent: false, rendererOptions: { collapseSubtasks: false } },
  )
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
