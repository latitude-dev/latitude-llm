import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { type Baseline, type BaselineFailure, readBaseline } from "../runner/baseline.ts"
import { loadFixture } from "../runner/benchmark.ts"
import { resolveTargets, TARGETS, targetPath } from "../runner/targets.ts"
import type { FixtureRow } from "../types.ts"

// CLI entry: `pnpm --filter @tools/ai-benchmarks benchmark:report <target-id>`
//
// Diagnostic report for fixture composition + (when a baseline exists)
// failure distribution by tag. Answers questions the TUI's per-row inspector
// can answer but slowly:
//   - "How many positives are partial-refusal vs full-refusal?"
//   - "Of the FN rows, what fraction carry prompt-ambiguous?"
//   - "Where are FPs concentrated — soft negatives or hard negatives?"
//
// Useful before deciding whether low recall is a flagger problem or a
// fixture-labeling problem. No LLM calls; no cost.

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const BASELINES_ROOT = join(PKG_ROOT, "baselines")

function usage(): never {
  const known = TARGETS.map((t) => t.id).join(", ")
  console.error(`usage: pnpm --filter @tools/ai-benchmarks benchmark:report <target-id>\nknown: ${known}`)
  process.exit(1)
}

// -- Helpers ------------------------------------------------------------------

interface TagCounts {
  pos: number
  neg: number
  total: number
}

function groupRowsByTagPrefix(rows: readonly FixtureRow[], prefix: string): Map<string, TagCounts> {
  const out = new Map<string, TagCounts>()
  for (const row of rows) {
    for (const tag of row.tags) {
      if (!tag.startsWith(prefix)) continue
      let bucket = out.get(tag)
      if (bucket === undefined) {
        bucket = { pos: 0, neg: 0, total: 0 }
        out.set(tag, bucket)
      }
      if (row.expected.matched) bucket.pos += 1
      else bucket.neg += 1
      bucket.total += 1
    }
  }
  return out
}

function groupFailuresByTagPrefix(failures: readonly BaselineFailure[], prefix: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const f of failures) {
    for (const tag of f.tags) {
      if (!tag.startsWith(prefix)) continue
      out.set(tag, (out.get(tag) ?? 0) + 1)
    }
  }
  return out
}

function pad(s: string, w: number, align: "left" | "right" = "left"): string {
  return align === "left" ? s.padEnd(w) : s.padStart(w)
}

function printTable(header: readonly string[], rows: readonly (readonly string[])[]): void {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)))
  const fmt = (cells: readonly string[]): string =>
    cells.map((c, i) => (i === 0 ? pad(c, widths[i], "left") : pad(c, widths[i], "right"))).join("    ")
  console.log(`  ${fmt(header)}`)
  for (const r of rows) console.log(`  ${fmt(r)}`)
}

function pct(n: number, d: number): string {
  if (d === 0) return "n/a"
  return `${((n / d) * 100).toFixed(1)}%`
}

// -- Sections -----------------------------------------------------------------

function printFixtureComposition(rows: readonly FixtureRow[]): void {
  const positives = rows.filter((r) => r.expected.matched).length
  const negatives = rows.length - positives

  console.log("=".repeat(80))
  console.log(`Fixture: ${rows.length} rows  (${positives} positives, ${negatives} negatives)`)
  console.log("=".repeat(80))
  console.log()

  for (const prefix of ["compliance:", "safety:", "model:"]) {
    const buckets = groupRowsByTagPrefix(rows, prefix)
    if (buckets.size === 0) continue
    console.log(`== Composition by ${prefix.slice(0, -1)} ==`)
    const tableRows: string[][] = []
    for (const [tag, counts] of [...buckets.entries()].sort()) {
      tableRows.push([tag, String(counts.pos), String(counts.neg), String(counts.total)])
    }
    printTable(["", "positives", "negatives", "total"], tableRows)
    console.log()
  }

  const ambiguous = rows.filter((r) => r.tags.includes("prompt-ambiguous"))
  if (ambiguous.length > 0) {
    const ambPos = ambiguous.filter((r) => r.expected.matched).length
    console.log(`== prompt-ambiguous rows ==`)
    console.log(`  ${ambPos} / ${positives} positives (${pct(ambPos, positives)}) carry prompt-ambiguous.`)
    console.log(`  These are typically safe + 3_partial_refusal — debatable per the queue's`)
    console.log(`  "appropriate caveats followed by a real answer" exclusion. Worth review.`)
    console.log()
  }
}

function printBaselineFailures(baseline: Baseline): void {
  const fns = baseline.failures.filter((f) => f.expected === true && f.predicted === false)
  const fps = baseline.failures.filter((f) => f.expected === false && f.predicted === true)
  const m = baseline.metrics

  console.log("=".repeat(80))
  console.log(`Baseline: ${baseline.failures.length} failures  (${fns.length} FN, ${fps.length} FP)`)
  console.log(
    `  precision=${(m.precision * 100).toFixed(1)}%  recall=${(m.recall * 100).toFixed(1)}%  f1=${(m.f1 * 100).toFixed(1)}%`,
  )
  console.log("=".repeat(80))
  console.log()

  const printGroup = (failures: readonly BaselineFailure[], label: "FN" | "FP", prefix: string): void => {
    if (failures.length === 0) return
    const buckets = groupFailuresByTagPrefix(failures, prefix)
    if (buckets.size === 0) return
    console.log(`== ${label} by ${prefix.slice(0, -1)} ==`)
    const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1])
    const tableRows = sorted.map(([tag, count]) => [tag, String(count), pct(count, failures.length)])
    printTable(["", "count", `% of ${label}`], tableRows)
    console.log()
  }

  for (const prefix of ["compliance:", "safety:", "model:", "tactic:"]) printGroup(fns, "FN", prefix)
  for (const prefix of ["safety:", "model:", "tactic:"]) printGroup(fps, "FP", prefix)

  if (fns.length > 0) {
    const ambFn = fns.filter((f) => f.tags.includes("prompt-ambiguous")).length
    console.log(`== prompt-ambiguous in FN ==`)
    console.log(`  ${ambFn} / ${fns.length} FN (${pct(ambFn, fns.length)}) carry prompt-ambiguous.`)
    console.log(`  If this fraction is high, the partial-refusal labeling is the likely`)
    console.log(`  cause of low recall — not the flagger itself.`)
    console.log()
  }
}

// -- Main ---------------------------------------------------------------------

async function main(): Promise<void> {
  const id = process.argv[2]
  if (!id) usage()
  const targets = resolveTargets([id])
  if (targets.length !== 1) usage()
  const target = targets[0]
  if (target === undefined) usage()

  const rows = await loadFixture(target)
  printFixtureComposition(rows)

  const baselinePath = join(BASELINES_ROOT, `${targetPath(target.id)}.json`)
  const baseline = await readBaseline(baselinePath)
  if (baseline === null) {
    console.log(`(no baseline at baselines/${targetPath(target.id)}.json)`)
    console.log(`run \`benchmark:run --only ${target.id} --update-baseline\` to populate the failure breakdown.`)
    return
  }
  printBaselineFailures(baseline)
}

await main()
