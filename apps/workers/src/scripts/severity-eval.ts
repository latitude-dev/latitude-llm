import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import type { ScoreSourceType } from "@domain/scores"
import { OrganizationId } from "@domain/shared"
import { SEED_ORG_ID } from "@domain/shared/seeding"
import {
  applySeverityFloor,
  flaggerSeverityFloor,
  generateSignalDetailsUseCase,
  isDeterministicFlagger,
  type SignalPriority,
} from "@domain/signals"
import { AIGenerateLive, withAi } from "@platform/ai"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"

const USAGE = `
Usage: pnpm --filter @app/workers severity:eval --cases-file <p> [options]

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
  --cases-file <p>    Required. Cases exported from elsewhere, since nothing here
                      connects to a database. Each entry needs "feedback" and
                      "priority"; "sourceType", "value" and "flaggerSlug" are optional
                      and snake_case keys are accepted. Keep the file outside this
                      public repo — it holds customer text.

                      Two things to know about production labels before trusting a
                      number. They are genuinely human (rating at creation has never
                      run there), but a person can only triage a signal that already
                      exists — so every label was applied to a signal with history
                      while the rubric sees one occurrence. And two people rating the
                      same occurrence blind agree on the exact tier only 60% of the
                      time, so read any score against that, not against 100%.
  --include-user-origin  Also grade user-created signals. Off by default: their level was
                      picked by the author for a concept, and none of them is low.
  --first <n>         Grade only the first n cases. Cheap way to sanity-check an export.
  --help
`.trim()

loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

const LEVELS: readonly SignalPriority[] = ["low", "medium", "high", "urgent"]
const rank = (level: SignalPriority) => LEVELS.indexOf(level)

interface Case {
  readonly id: string
  /** Cases sharing a signal share a label, so agreement is also reported per signal. */
  readonly signalSlug?: string
  readonly feedback: string
  readonly sourceType: ScoreSourceType
  readonly value: number
  readonly flaggerSlug?: string
  /** A check wrote this line. From `source_id = 'SYSTEM'`; survives a missing slug. */
  readonly machineAuthored?: boolean
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
        machineAuthored: input.machineAuthored === true,
        ...(input.flaggerSlug === undefined ? {} : { flaggerSlug: input.flaggerSlug }),
      },
    ],
    withSeverity: true,
  }).pipe(
    Effect.map((details) => applySeverityFloor(details.severity ?? null, flaggerSeverityFloor(input.flaggerSlug))),
    // No Redis client, so no AI cache. Passing one makes `--runs` re-read a
    // single cached answer — the prompt is the cache key — and instability
    // silently reports 0% for every case no matter how much the model wavers.
    withAi(AIGenerateLive),
  )

/**
 * Cases exported from elsewhere — a notebook with VPC access, typically, when
 * the database is not reachable from here. Field names are accepted in either
 * the snake_case a SQL export produces or the camelCase the script uses.
 *
 * Keep the file outside the repo: it holds real customer feedback and this
 * repository is public.
 */
const loadFileCases = (path: string, includeUserOrigin: boolean): readonly Case[] => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (!Array.isArray(parsed)) throw new Error(`${path} must contain a JSON array of cases`)

  return parsed.flatMap((entry, index) => {
    const row = entry as Record<string, unknown>
    const label = (row.priority ?? row.expected) as SignalPriority | undefined
    const feedback = row.feedback as string | undefined
    if (label === undefined || !LEVELS.includes(label)) {
      throw new Error(`case ${index}: "priority" must be one of ${LEVELS.join(", ")}`)
    }
    if (typeof feedback !== "string" || feedback.trim() === "") {
      throw new Error(`case ${index}: "feedback" is required`)
    }
    // A user-created signal's level was chosen by its author before any
    // occurrence existed, and nobody creates a signal to record something
    // unimportant: across production every one of them is medium or above, not a
    // single `low`. Grading them drags the `low` share of the set from 10% to 3%
    // and teaches nothing about the boundary a threshold actually acts on.
    const origin = (row.origin ?? null) as string | null
    if (origin === "user" && !includeUserOrigin) return []
    const slug = (row.flaggerSlug ?? row.flagger_slug) as string | null | undefined
    const rawValue = row.value
    return [
      {
        id: String(row.id ?? `case-${index + 1}`),
        feedback,
        sourceType: ((row.sourceType ?? row.source_type) as ScoreSourceType) ?? "annotation",
        value: rawValue === undefined || rawValue === null ? 0 : Number(rawValue),
        ...(slug ? { flaggerSlug: slug } : {}),
        ...(typeof (row.signalSlug ?? row.signal_slug) === "string"
          ? { signalSlug: String(row.signalSlug ?? row.signal_slug) }
          : {}),
        machineAuthored: (row.machineAuthored ?? row.machine_authored) === true || Boolean(slug),
        expected: label,
        acceptable: LEVELS.filter((level) => Math.abs(rank(level) - rank(label)) <= 1),
      },
    ]
  })
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      runs: { type: "string" },
      first: { type: "string" },
      "cases-file": { type: "string" },
      "include-user-origin": { type: "boolean", default: false },
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
  if (casesFile === undefined) {
    console.log(USAGE)
    return
  }
  const all: readonly Case[] = loadFileCases(casesFile, values["include-user-origin"] === true)
  const cases = values.first === undefined ? all : all.slice(0, Number(values.first))

  if (cases.length === 0) {
    console.log("No cases to grade.")
    return
  }

  // Production does not rate these, so grading the rubric on them would measure
  // a path nothing takes. Their labels are still evidence — a human calling one
  // `urgent` is an argument against starting them at `low` — so they are
  // reported rather than dropped.
  const deterministic = cases.filter((testCase) => isDeterministicFlagger(testCase.flaggerSlug))
  const gradable = cases.filter((testCase) => !isDeterministicFlagger(testCase.flaggerSlug))
  if (deterministic.length > 0) {
    const above = deterministic.filter((testCase) => rank(testCase.expected) > rank("low"))
    console.log(
      `${deterministic.length} deterministic-detector case(s) not graded — production starts them at low and lets volume move them.`,
    )
    if (above.length > 0) {
      console.log(
        `  ${above.length} of those were labelled above low: ${above
          .map((testCase) => `${testCase.id}=${testCase.expected}`)
          .join(", ")}`,
      )
      console.log("  A label above low here argues the volume model is too slow for that detector.\n")
    } else {
      console.log("  None were labelled above low, which is what starting them at low assumes.\n")
    }
  }
  if (gradable.length === 0) {
    console.log("Nothing left to grade.")
    return
  }

  const orgId = OrganizationId(SEED_ORG_ID)
  const projectId = "severity-eval"
  console.log(`Grading ${gradable.length} case(s) × ${runs} run(s)\n`)

  let exact = 0
  let acceptable = 0
  let unstable = 0
  let majorityExact = 0
  const perCaseOutcomes: {
    readonly id: string
    readonly signalSlug?: string
    readonly matched: boolean
    readonly machineAuthored: boolean
    readonly expected: SignalPriority
    readonly predicted: SignalPriority | null
  }[] = []
  const falseLows: string[] = []
  const falseHighs: string[] = []

  for (const testCase of gradable) {
    const results: (SignalPriority | null)[] = []
    for (let run = 0; run < runs; run++) {
      const level = await Effect.runPromise(rate(testCase, orgId, projectId))
      results.push(level)
    }

    // Majority of the repeats, not the first answer. Worth reporting separately:
    // if voting beats single-shot by a lot, the rubric's problem is variance and
    // the cheap fix is a lower temperature or a vote, not more tuning data.
    const tally = new Map<string, number>()
    for (const level of results) tally.set(level ?? "none", (tally.get(level ?? "none") ?? 0) + 1)
    const majorityKey = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const majority = majorityKey === "none" || majorityKey === undefined ? null : (majorityKey as SignalPriority)
    if (majority === testCase.expected) majorityExact++

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

    perCaseOutcomes.push({
      id: testCase.id,
      ...(testCase.signalSlug === undefined ? {} : { signalSlug: testCase.signalSlug }),
      matched,
      machineAuthored: testCase.machineAuthored === true,
      expected: testCase.expected,
      predicted: first,
    })

    const flag = matched ? "  " : withinAcceptable ? "~ " : "✗ "
    const stability = distinct.length > 1 ? `  [unstable: ${distinct.join("/")}]` : ""
    const label = testCase.id
    console.log(
      `${flag}${label} expected=${testCase.expected.padEnd(6)} got=${(first ?? "none").padEnd(6)}${stability}`,
    )
  }

  // Split by who wrote the text. Production rates detector-authored occurrences
  // whenever the slug is missing, so they belong in the eval — but if agreement
  // is much worse on them, that is a finding about rating templated output, not
  // about the rubric's reading of prose.
  const byAuthor = (machine: boolean) => perCaseOutcomes.filter((entry) => entry.machineAuthored === machine)
  const human = byAuthor(false)
  const detector = byAuthor(true)
  if (human.length > 0 && detector.length > 0) {
    const share = (group: typeof perCaseOutcomes) => `${group.filter((entry) => entry.matched).length}/${group.length}`
    console.log(`by author        human-written ${share(human)} exact, detector-written ${share(detector)} exact`)
  }

  // An export with several occurrences per signal is correlated: one signal with
  // twelve occurrences would otherwise dominate the flat percentage.
  const bySignal = new Map<string, { readonly total: number; readonly exact: number }>()
  for (const entry of perCaseOutcomes) {
    const key = entry.signalSlug ?? entry.id
    const prev = bySignal.get(key) ?? { total: 0, exact: 0 }
    bySignal.set(key, { total: prev.total + 1, exact: prev.exact + (entry.matched ? 1 : 0) })
  }

  const pct = (n: number) => `${Math.round((100 * n) / gradable.length)}%`
  console.log(`\nexact            ${exact}/${gradable.length} (${pct(exact)})`)
  console.log(`within tolerance ${acceptable}/${gradable.length} (${pct(acceptable)})`)
  if (runs > 1) {
    console.log(`majority-of-${runs}     ${majorityExact}/${gradable.length} (${pct(majorityExact)}) exact`)
  }
  console.log(`unstable         ${unstable}/${gradable.length} (${pct(unstable)}) — differed across runs`)
  if (bySignal.size !== gradable.length) {
    const unanimous = [...bySignal.values()].filter((entry) => entry.exact === entry.total).length
    const partial = [...bySignal.values()].filter((entry) => entry.exact > 0 && entry.exact < entry.total).length
    console.log(
      `per signal       ${unanimous}/${bySignal.size} signals matched on every occurrence, ${partial} on some — ` +
        "the flat percentages above overweight signals with more occurrences",
    )
  }
  console.log(`FALSE-LOW        ${falseLows.length} ${falseLows.length > 0 ? `→ ${falseLows.join(", ")}` : ""}`)
  console.log(`false-high       ${falseHighs.length} ${falseHighs.length > 0 ? `→ ${falseHighs.join(", ")}` : ""}`)
  if (falseLows.length > 0) {
    console.log("\nA false-low is delivered to nobody. Treat any non-zero count as a rubric bug.")
  }

  // The level is consumed as a threshold cut, not as a 4-way label. What decides
  // whether this is good enough is per-cut: at the level a customer actually
  // sets, how much do they lose and how much noise do they keep?
  console.log("\nAs a delivery threshold — what a customer setting each cut would see:")
  for (const cut of ["medium", "high", "urgent"] as const) {
    const wanted = perCaseOutcomes.filter((entry) => rank(entry.expected) >= rank(cut))
    const unwanted = perCaseOutcomes.filter((entry) => rank(entry.expected) < rank(cut))
    const delivered = (entry: { readonly predicted: SignalPriority | null }) =>
      entry.predicted !== null && rank(entry.predicted) >= rank(cut)
    const kept = wanted.filter(delivered).length
    const lost = wanted.length - kept
    const noise = unwanted.filter(delivered).length
    console.log(
      `  >= ${cut.padEnd(6)} keeps ${kept}/${wanted.length} of what they wanted` +
        `, loses ${lost}` +
        `, plus ${noise} they did not (${unwanted.length} below the cut)`,
    )
  }
}

main()
  // Provider handles keep the loop alive; nothing here needs draining.
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
