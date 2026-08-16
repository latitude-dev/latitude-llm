/**
 * Prints what the cache-signal gates do to each QA fixture, and optionally feeds a
 * fixture's spans into ClickHouse so the same case can be walked end to end.
 *
 *   pnpm --filter @platform/db-clickhouse ch:cache-signals:report
 *   pnpm --filter @platform/db-clickhouse ch:cache-signals:report --set=negatives
 *   pnpm --filter @platform/db-clickhouse ch:cache-signals:report --set=positives --write=<projectId>
 *
 * The report is pure — it needs no ClickHouse at all — because the gate is a pure
 * function of the judged windows. `--write` exists for the other half of QA: seeing the
 * cost panel, the signals inbox and a real dispatch agree with the table below.
 */

import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { ProjectId } from "@domain/shared/seeding"
import { SEED_COST_ARCHETYPE_PROJECTS, SEED_PROJECT_ID } from "@domain/shared/seeding"
import type { CacheFindingReview } from "@domain/spans"
import { CACHE_SIGNAL_MIN_CALLS, CACHE_SIGNAL_STABILITY_WINDOWS, CACHE_SIGNAL_WINDOW_DAYS } from "@domain/spans"
import { parseEnv } from "@platform/env"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { closeClickhouse, createClickhouseClient } from "../../../client.ts"
import { insertJsonEachRow } from "../../../sql.ts"
import { feedCacheFindingReview, feedSpans } from "./cache-feeder.ts"
import {
  CACHE_SIGNAL_NEGATIVE_COHORTS,
  CACHE_SIGNAL_OSCILLATING_COHORTS,
  CACHE_SIGNAL_POSITIVE_COHORTS,
} from "./cache-signal-qa.ts"
import type { CostCohort } from "./cohorts.ts"
import { FINDINGS_FIRE_COHORTS } from "./findings-fire.ts"
import { HEALTHY_COHORTS } from "./healthy.ts"

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../../../../../../.env.${nodeEnv}`, import.meta.url))
if (existsSync(envFilePath)) loadDotenv({ path: envFilePath, quiet: true })

const BATCH_SIZE = 500

const FIXTURE_SETS: Readonly<
  Record<string, { readonly cohorts: readonly CostCohort[]; readonly projectId: ProjectId; readonly expects: string }>
> = {
  positives: {
    cohorts: CACHE_SIGNAL_POSITIVE_COHORTS,
    projectId: SEED_PROJECT_ID,
    expects: "one finding each: Cache it, Stop caching, Investigate",
  },
  negatives: {
    cohorts: CACHE_SIGNAL_NEGATIVE_COHORTS,
    projectId: SEED_PROJECT_ID,
    expects: "no findings — sparse, at-ceiling, free, under the spend floor, under the sample floor",
  },
  oscillating: {
    cohorts: CACHE_SIGNAL_OSCILLATING_COHORTS,
    projectId: SEED_PROJECT_ID,
    expects: "no findings — the verdict alternates week to week",
  },
  healthy: {
    cohorts: HEALTHY_COHORTS,
    projectId: SEED_COST_ARCHETYPE_PROJECTS.healthy.id,
    expects: "no findings at all; one here means the gates are wrong",
  },
  "findings-fire": {
    cohorts: FINDINGS_FIRE_COHORTS,
    projectId: SEED_PROJECT_ID,
    expects: "the seeded demo archetype, sized for the 30-day panel rather than weekly stability",
  },
}

const percent = (rate: number): string => `${(rate * 100).toFixed(1)}%`
const usd = (microcents: number): string => `$${(microcents / 100_000_000).toFixed(2)}`

const printReview = (name: string, expects: string, review: CacheFindingReview): void => {
  console.log(`\n${name} — expected: ${expects}`)
  if (review.findings.length === 0) {
    console.log("  fires: none")
  }
  for (const finding of review.findings) {
    const { model, provider, state, actualRate, ceilingRate, breakEvenRate, calls, modeledSavingsMicrocents } =
      finding.measures
    console.log(
      `  FIRES  ${state.padEnd(12)} ${model} (${provider})  actual ${percent(actualRate)} / break-even ${percent(breakEvenRate)} / ceiling ${percent(ceilingRate)}  ${calls} calls  saves ${usd(modeledSavingsMicrocents)}`,
    )
  }
  for (const entry of review.suppressed) {
    console.log(
      `  quiet  ${entry.suppressedBy.padEnd(12)} ${entry.model} (${entry.provider})  panel state: ${entry.state}`,
    )
  }
}

const writeSpans = async (cohorts: readonly CostCohort[], projectId: ProjectId, anchor: Date): Promise<void> => {
  const spans = feedSpans({ cohorts, projectId, anchor })
  const client = createClickhouseClient()
  await Effect.runPromise(
    Effect.gen(function* () {
      for (let offset = 0; offset < spans.length; offset += BATCH_SIZE) {
        yield* insertJsonEachRow(client, "spans", spans.slice(offset, offset + BATCH_SIZE))
      }
    }),
  )
  await closeClickhouse(client)
  console.log(`\nwrote ${spans.length} spans to project ${projectId}`)
}

const flag = (name: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=")[1]

const main = async (): Promise<void> => {
  // Mirrors the seed runner's guard: `--write` inserts spans, and doing that against
  // production data would be irreversible.
  if (nodeEnv === "production") {
    console.error("ERROR: the cache-signal report refuses to run in production")
    process.exitCode = 1
    return
  }

  const anchor = new Date()
  const requested = flag("set")
  const write = flag("write")

  console.log(
    `Cache-signal gates: a finding must hold across ${CACHE_SIGNAL_STABILITY_WINDOWS} windows of ${CACHE_SIGNAL_WINDOW_DAYS} days, over at least ${CACHE_SIGNAL_MIN_CALLS} calls per window, with a known ceiling and clearing the spend floor.`,
  )

  const sets = requested ? [[requested, FIXTURE_SETS[requested]] as const] : Object.entries(FIXTURE_SETS)
  for (const [name, fixture] of sets) {
    if (!fixture) {
      console.error(`unknown fixture set "${name}" — try one of ${Object.keys(FIXTURE_SETS).join(", ")}`)
      process.exitCode = 1
      return
    }
    printReview(name, fixture.expects, feedCacheFindingReview({ ...fixture, anchor }))
  }

  if (write !== undefined && requested !== undefined) {
    const fixture = FIXTURE_SETS[requested]
    if (fixture) await writeSpans(fixture.cohorts, write as ProjectId, anchor)
  } else if (write !== undefined) {
    console.error("\n--write needs --set: pick one fixture rather than feeding every shape into one project")
    process.exitCode = 1
  }
}

await main()
