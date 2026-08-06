import { readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { OrganizationId } from "@domain/shared"
import { SEED_ORG_ID } from "@domain/shared/seeding"
import {
  applySeverityFloor,
  flaggerSeverityFloor,
  generateSignalDetailsUseCase,
  type SignalPriority,
} from "@domain/signals"
import { AIGenerateLive, withAi } from "@platform/ai"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { getRedisClient } from "../clients.ts"
import { SEVERITY_FIXTURES, type SeverityFixture } from "./severity-eval-fixtures.ts"
import { type ReportCase, renderReport } from "./severity-eval-report.ts"

const USAGE = `
Usage: pnpm --filter @app/workers severity:eval [options]

Grades the severity rubric by running real generation over cases with a known
expected level, then reports what moved. Not a CI test: it costs money per run,
needs Bedrock credentials, and an LLM will sometimes disagree with itself —
which is why every case runs several times and instability is reported
separately from being wrong.

The score to read is FALSE-LOW: a case the rubric calls high or urgent that came
back low. Those are the ones a minimum-severity threshold silently drops. A
false-high is noise, and an adjacent middle tier is arguable.

Options:
  --runs <n>          Repeats per case (default 3). Reveals instability.
  --cases-file <p>    Grade cases exported from elsewhere — a notebook with database
                      access, typically, since nothing here connects to one. Each entry
                      needs "feedback" and "priority"; "sourceType", "value" and
                      "flaggerSlug" are optional and snake_case keys are accepted. Keep
                      the file outside this public repo — it holds customer text.
  --help
`.trim()

loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

const LEVELS: readonly SignalPriority[] = ["low", "medium", "high", "urgent"]
const rank = (level: SignalPriority) => LEVELS.indexOf(level)

interface Case {
  readonly id: string
  readonly feedback: string
  readonly sourceType: SeverityFixture["sourceType"]
  readonly value: number
  readonly flaggerSlug?: string
  readonly expected: SignalPriority
  readonly acceptable: readonly SignalPriority[]
}

const rate = (input: Case, organizationId: string, projectId: string) =>
  generateSignalDetailsUseCase({
    organizationId,
    projectId,
    occurrences: [
      {
        sourceType: input.sourceType,
        feedback: input.feedback,
        value: input.value,
        ...(input.flaggerSlug === undefined ? {} : { flaggerSlug: input.flaggerSlug }),
      },
    ],
    withSeverity: true,
  }).pipe(
    Effect.map((details) => applySeverityFloor(details.severity ?? null, flaggerSeverityFloor(input.flaggerSlug))),
    withAi(AIGenerateLive, getRedisClient()),
  )

/**
 * Cases exported from elsewhere — a notebook with VPC access, typically, when
 * the database is not reachable from here. Field names are accepted in either
 * the snake_case a SQL export produces or the camelCase the script uses.
 *
 * Keep the file outside the repo: it holds real customer feedback and this
 * repository is public.
 */
const loadFileCases = (path: string): readonly Case[] => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (!Array.isArray(parsed)) throw new Error(`${path} must contain a JSON array of cases`)

  return parsed.map((entry, index) => {
    const row = entry as Record<string, unknown>
    const label = (row.priority ?? row.expected) as SignalPriority | undefined
    const feedback = row.feedback as string | undefined
    if (label === undefined || !LEVELS.includes(label)) {
      throw new Error(`case ${index}: "priority" must be one of ${LEVELS.join(", ")}`)
    }
    if (typeof feedback !== "string" || feedback.trim() === "") {
      throw new Error(`case ${index}: "feedback" is required`)
    }
    const slug = (row.flaggerSlug ?? row.flagger_slug) as string | null | undefined
    const rawValue = row.value
    return {
      id: String(row.id ?? `case-${index + 1}`),
      feedback,
      sourceType: ((row.sourceType ?? row.source_type) as SeverityFixture["sourceType"]) ?? "annotation",
      value: rawValue === undefined || rawValue === null ? 0 : Number(rawValue),
      ...(slug ? { flaggerSlug: slug } : {}),
      expected: label,
      acceptable: LEVELS.filter((level) => Math.abs(rank(level) - rank(label)) <= 1),
    }
  })
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      runs: { type: "string" },
      first: { type: "string" },
      html: { type: "string" },
      "cases-file": { type: "string" },
      help: { type: "boolean", default: false },
    },
    strict: true,
  })
  if (values.help) {
    console.log(USAGE)
    return
  }

  const runs = Number(values.runs ?? 3)
  const casesFile = values["cases-file"]
  const all: readonly Case[] = casesFile
    ? loadFileCases(casesFile)
    : SEVERITY_FIXTURES.map((fixture) => ({ ...fixture }))
  const cases = values.first === undefined ? all : all.slice(0, Number(values.first))

  if (cases.length === 0) {
    console.log("No cases to grade.")
    return
  }

  const orgId = OrganizationId(SEED_ORG_ID)
  const projectId = "severity-eval"
  const sourceLabel = casesFile ? "exported cases" : "fixtures"
  console.log(`Grading ${cases.length} case(s) × ${runs} run(s) — ${sourceLabel}\n`)

  let exact = 0
  let acceptable = 0
  let unstable = 0
  const falseLows: string[] = []
  const falseHighs: string[] = []
  const reportCases: ReportCase[] = []

  for (const testCase of cases) {
    const results: (SignalPriority | null)[] = []
    for (let run = 0; run < runs; run++) {
      const level = await Effect.runPromise(rate(testCase, orgId, projectId))
      results.push(level)
    }

    const distinct = [...new Set(results.map((level) => level ?? "none"))]
    if (distinct.length > 1) unstable++
    const first = results[0] ?? null
    const matched = first === testCase.expected
    const withinAcceptable = first !== null && testCase.acceptable.includes(first)
    if (matched) exact++
    if (withinAcceptable) acceptable++

    const expectedHigh = rank(testCase.expected) >= rank("high")
    if (expectedHigh && first === "low") falseLows.push(testCase.id)
    if (!expectedHigh && first !== null && rank(first) >= rank("high")) falseHighs.push(testCase.id)

    reportCases.push({
      id: testCase.id,
      feedback: testCase.feedback,
      sourceType: testCase.sourceType,
      value: testCase.value,
      ...(testCase.flaggerSlug === undefined ? {} : { flaggerSlug: testCase.flaggerSlug }),
      label: testCase.expected,
      model: first,
      floored: flaggerSeverityFloor(testCase.flaggerSlug) !== null,
    })

    const flag = matched ? "  " : withinAcceptable ? "~ " : "✗ "
    const stability = distinct.length > 1 ? `  [unstable: ${distinct.join("/")}]` : ""
    const label = casesFile ? testCase.id : testCase.id.padEnd(28)
    console.log(
      `${flag}${label} expected=${testCase.expected.padEnd(6)} got=${(first ?? "none").padEnd(6)}${stability}`,
    )
  }

  const pct = (n: number) => `${Math.round((100 * n) / cases.length)}%`
  console.log(`\nexact            ${exact}/${cases.length} (${pct(exact)})`)
  console.log(`within tolerance ${acceptable}/${cases.length} (${pct(acceptable)})`)
  console.log(`unstable         ${unstable}/${cases.length} (${pct(unstable)}) — differed across runs`)
  console.log(`FALSE-LOW        ${falseLows.length} ${falseLows.length > 0 ? `→ ${falseLows.join(", ")}` : ""}`)
  console.log(`false-high       ${falseHighs.length} ${falseHighs.length > 0 ? `→ ${falseHighs.join(", ")}` : ""}`)
  if (falseLows.length > 0) {
    console.log("\nA false-low is delivered to nobody. Treat any non-zero count as a rubric bug.")
  }

  const htmlPath = values.html
  if (htmlPath !== undefined) {
    // Written to disk and opened locally, never published: in production mode
    // every card holds real customer feedback.
    writeFileSync(htmlPath, renderReport(reportCases, sourceLabel), "utf8")
    console.log(`\nBlind review written to ${htmlPath}`)
  }
}

main()
  // Redis and Postgres handles keep the loop alive; nothing here needs draining.
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
