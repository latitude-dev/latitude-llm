import { readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { SEVERITY_RUBRIC, type SignalPriority } from "@domain/signals"
import { type CeilingSlot, renderCeilingPage } from "./severity-ceiling-page.ts"

const USAGE = `
Usage:
  pnpm --filter @app/workers severity:ceiling --cases-file <p> --out <p.html>
  pnpm --filter @app/workers severity:ceiling --aggregate <a.json> <b.json> ...

Measures how much two people agree when rating the same single occurrence, which
is the ceiling any rubric can be held to. Without it a model score is
uninterpretable: 45% against a ceiling of 90% is a bad rubric, and 45% against a
ceiling of 50% is a finished one.

Build mode writes a local page. Keep it and the exports off this public repo and
off any host — every card is real customer feedback.

Options:
  --cases-file <p>  Cases in the severity:eval shape. Only "feedback" is required.
  --out <p>         Where to write the page. Default ./severity-ceiling.html
  --cases <n>       How many cases to include (default 30).
  --repeats <n>     How many of those to show twice, for self-consistency (default 5).
  --aggregate       Treat remaining arguments as rating exports and report agreement.
  --help
`.trim()

const LEVELS: readonly SignalPriority[] = ["low", "medium", "high", "urgent"]
const rank = (level: SignalPriority) => LEVELS.indexOf(level)

interface SourceCase {
  readonly id: string
  readonly feedback: string
  readonly tags: string
}

const loadCases = (path: string): readonly SourceCase[] => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (!Array.isArray(parsed)) throw new Error(`${path} must contain a JSON array`)

  return parsed.flatMap((entry, index) => {
    const row = entry as Record<string, unknown>
    const feedback = row.feedback
    if (typeof feedback !== "string" || feedback.trim() === "") return []
    const slug = (row.flaggerSlug ?? row.flagger_slug) as string | null | undefined
    const sourceType = ((row.sourceType ?? row.source_type) as string | undefined) ?? "annotation"
    // The same tag line the prompt builds, so raters and the model read one input.
    const tags = [`source=${sourceType}`, ...(slug ? [`detector=${slug}`] : [])].join(" ")
    return [{ id: String(row.id ?? `case-${index + 1}`), feedback, tags }]
  })
}

/**
 * Evenly spaced rather than random, so the sample spans the export's ordering
 * (which Q2 sorts by label) instead of clustering in whichever levels happen to
 * come first.
 */
const takeSpread = <T>(items: readonly T[], count: number): readonly T[] => {
  if (items.length <= count) return items
  const step = items.length / count
  return Array.from({ length: count }, (_, index) => items[Math.floor(index * step)] as T)
}

const buildSlots = (cases: readonly SourceCase[], repeats: number): readonly CeilingSlot[] => {
  const base = cases.map((source, index) => ({ slot: index, caseId: source.id, ...source }))
  const repeated = takeSpread(cases, Math.min(repeats, cases.length)).map((source, index) => ({
    slot: cases.length + index,
    caseId: source.id,
    ...source,
  }))
  return [...base, ...repeated].map(({ slot, caseId, feedback, tags }) => ({ slot, caseId, feedback, tags }))
}

interface RatingExport {
  readonly rater: string
  readonly ratings: readonly { readonly slot: number; readonly caseId: string; readonly level: SignalPriority }[]
}

/** First answer per case; the later duplicate is held back for self-consistency. */
const firstAnswers = (file: RatingExport): Map<string, SignalPriority> => {
  const seen = new Map<string, SignalPriority>()
  for (const rating of [...file.ratings].sort((a, b) => a.slot - b.slot)) {
    if (!seen.has(rating.caseId)) seen.set(rating.caseId, rating.level)
  }
  return seen
}

const selfConsistency = (file: RatingExport): { readonly repeated: number; readonly agreed: number } => {
  const byCase = new Map<string, SignalPriority[]>()
  for (const rating of file.ratings) {
    byCase.set(rating.caseId, [...(byCase.get(rating.caseId) ?? []), rating.level])
  }
  let repeated = 0
  let agreed = 0
  for (const levels of byCase.values()) {
    if (levels.length < 2) continue
    repeated++
    if (new Set(levels).size === 1) agreed++
  }
  return { repeated, agreed }
}

/**
 * Cohen's kappa alongside raw agreement. With four tiers and a distribution this
 * skewed toward the middle, two raters who both answer `high` most of the time
 * look like they agree when they are only sharing a habit.
 */
const kappa = (pairs: readonly (readonly [SignalPriority, SignalPriority])[]): number => {
  if (pairs.length === 0) return Number.NaN
  const observed = pairs.filter(([a, b]) => a === b).length / pairs.length
  const marginal = (index: 0 | 1) => {
    const counts = new Map<SignalPriority, number>()
    for (const pair of pairs) counts.set(pair[index], (counts.get(pair[index]) ?? 0) + 1)
    return counts
  }
  const left = marginal(0)
  const right = marginal(1)
  let expected = 0
  for (const level of LEVELS) {
    expected += ((left.get(level) ?? 0) / pairs.length) * ((right.get(level) ?? 0) / pairs.length)
  }
  return expected === 1 ? Number.NaN : (observed - expected) / (1 - expected)
}

const aggregate = (paths: readonly string[]): void => {
  const files = paths.map((path) => JSON.parse(readFileSync(path, "utf8")) as RatingExport)
  if (files.length === 0) {
    console.log("Nothing to aggregate.")
    return
  }

  console.log(`Raters: ${files.map((file) => file.rater).join(", ")}\n`)

  for (const file of files) {
    const { repeated, agreed } = selfConsistency(file)
    if (repeated === 0) continue
    console.log(
      `self-consistency  ${file.rater}: ${agreed}/${repeated} repeated cases answered the same` +
        ` (${Math.round((100 * agreed) / repeated)}%)`,
    )
  }

  if (files.length < 2) {
    console.log("\nOnly one rater — no ceiling yet. Two is the minimum, three is better.")
    return
  }

  console.log("")
  const exactRates: number[] = []
  const withinRates: number[] = []
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const left = firstAnswers(files[i] as RatingExport)
      const right = firstAnswers(files[j] as RatingExport)
      const pairs: (readonly [SignalPriority, SignalPriority])[] = []
      for (const [caseId, level] of left) {
        const other = right.get(caseId)
        if (other !== undefined) pairs.push([level, other])
      }
      if (pairs.length === 0) continue
      const exact = pairs.filter(([a, b]) => a === b).length
      const within = pairs.filter(([a, b]) => Math.abs(rank(a) - rank(b)) <= 1).length
      exactRates.push(exact / pairs.length)
      withinRates.push(within / pairs.length)
      const k = kappa(pairs)
      console.log(
        `${(files[i] as RatingExport).rater} vs ${(files[j] as RatingExport).rater}: ` +
          `exact ${exact}/${pairs.length} (${Math.round((100 * exact) / pairs.length)}%), ` +
          `within one ${within}/${pairs.length} (${Math.round((100 * within) / pairs.length)}%), ` +
          `kappa ${Number.isNaN(k) ? "n/a" : k.toFixed(2)}`,
      )
    }
  }

  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  console.log(
    `\nCEILING  exact ${Math.round(100 * mean(exactRates))}%, within one ${Math.round(100 * mean(withinRates))}%`,
  )
  console.log("Compare severity:eval against these, not against 100%. A rubric that matches them is finished.")
}

const main = (): void => {
  const { values, positionals } = parseArgs({
    options: {
      "cases-file": { type: "string" },
      out: { type: "string" },
      cases: { type: "string" },
      repeats: { type: "string" },
      aggregate: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  })
  if (values.help) {
    console.log(USAGE)
    return
  }
  if (values.aggregate) {
    aggregate(positionals)
    return
  }

  const casesFile = values["cases-file"]
  if (casesFile === undefined) {
    console.log(USAGE)
    return
  }

  const all = loadCases(casesFile)
  const chosen = takeSpread(all, Number(values.cases ?? 30))
  const slots = buildSlots(chosen, Number(values.repeats ?? 5))
  const out = values.out ?? "./severity-ceiling.html"
  writeFileSync(out, renderCeilingPage(slots, SEVERITY_RUBRIC), "utf8")

  console.log(`${chosen.length} case(s) + ${slots.length - chosen.length} repeat(s) = ${slots.length} ratings each.`)
  console.log(`Wrote ${out}`)
  console.log("\nSend it to two or three people. Keep it off the repo and off any host — it holds customer feedback.")
  console.log("Then: pnpm --filter @app/workers severity:ceiling --aggregate rater-a.json rater-b.json")
}

main()
