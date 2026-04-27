import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Metrics, Prediction } from "./metrics.ts"

export interface BaselineFailure {
  readonly id: string
  readonly expected: boolean
  readonly predicted: boolean
  readonly phase: Prediction["phase"]
  readonly tags: readonly string[]
}

export interface Baseline {
  readonly runAt: string
  readonly metrics: Metrics
  readonly perTactic: Record<string, Metrics>
  readonly perPhase: Record<Prediction["phase"], number>
  readonly fixtureSize: number
  readonly rowIdsHash: string
  readonly failures: readonly BaselineFailure[]
}

export interface FailureChange {
  readonly id: string
  readonly was: { predicted: boolean; phase: Prediction["phase"]; tags: readonly string[] }
  readonly now: { predicted: boolean; phase: Prediction["phase"]; tags: readonly string[] }
}

export interface BaselineDiff {
  readonly addedFailures: readonly BaselineFailure[]
  readonly removedFailures: readonly BaselineFailure[]
  readonly changedFailures: readonly FailureChange[]
  readonly fixtureChanged: boolean
}

/**
 * A "failure" is any row worth committing to the baseline so a future diff
 * can flag regressions or fixes:
 *   - verdict mismatch (FP or FN)
 *   - schema-mismatch phase (LLM output couldn't be parsed; classifier
 *     recovered to matched=false — verdict may happen to match expected
 *     but the underlying call is unstable)
 *   - error phase (classifier crashed on this row)
 *
 * Passing rows in stable phases are intentionally excluded — keeping the
 * baseline file small and the diff focused on regressions.
 */
function isFailurePrediction(prediction: Prediction): boolean {
  if (prediction.predicted !== prediction.expected) return true
  return prediction.phase === "schema-mismatch" || prediction.phase === "error"
}

export function selectFailures(predictions: readonly Prediction[]): BaselineFailure[] {
  return predictions.filter(isFailurePrediction).map((p) => ({
    id: p.id,
    expected: p.expected,
    predicted: p.predicted,
    phase: p.phase,
    tags: p.tags,
  }))
}

/**
 * Stable fingerprint of the fixture's composition. Used to detect when the
 * mapper added or removed rows between baseline and current run. We hash the
 * sorted ID list rather than committing it so the baseline file stays tiny
 * even on large fixtures.
 */
export function hashRowIds(ids: readonly string[]): string {
  const hash = createHash("sha256")
  for (const id of [...ids].sort()) {
    hash.update(id)
    hash.update("\n")
  }
  return hash.digest("hex")
}

export async function readBaseline(path: string): Promise<Baseline | null> {
  try {
    await stat(path)
  } catch {
    return null
  }
  return JSON.parse(await readFile(path, "utf8")) as Baseline
}

/**
 * Serialize a baseline with the header pretty-printed but each entry of
 * `failures[]` flattened to a single line. Two reasons:
 *   - Bytes: a pretty-printed failure spans ~10 lines (~280 bytes); a
 *     compact one-liner is ~130 bytes — roughly halves the file.
 *   - Diffs: one row per line means a flipped failure shows as a single
 *     removed + single added line in `git diff`, instead of a 12-line
 *     hunk that obscures the actual change.
 */
function serializeBaseline(baseline: Baseline): string {
  const head = {
    runAt: baseline.runAt,
    metrics: baseline.metrics,
    perTactic: baseline.perTactic,
    perPhase: baseline.perPhase,
    fixtureSize: baseline.fixtureSize,
    rowIdsHash: baseline.rowIdsHash,
  }
  // Pretty-print the head, then strip the trailing closing brace so we can
  // append the failures array and a fresh closing brace ourselves.
  const headJson = JSON.stringify(head, null, 2).replace(/\n\}\s*$/, "")
  if (baseline.failures.length === 0) {
    return `${headJson},\n  "failures": []\n}\n`
  }
  const failureLines = baseline.failures.map((f) => `    ${JSON.stringify(f)}`)
  return `${headJson},\n  "failures": [\n${failureLines.join(",\n")}\n  ]\n}\n`
}

export async function writeBaseline(path: string, baseline: Baseline): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, serializeBaseline(baseline))
}

/**
 * Compare the current run's failures against the baseline's failures.
 *
 * The diff is a set-symmetric operation over committed failure rows:
 *   - addedFailures   — failures present now but not in the baseline
 *                       (regression, or new instability)
 *   - removedFailures — failures present in the baseline but not now
 *                       (fix, or instability that resolved)
 *   - changedFailures — rows in both whose (predicted, phase) tuple shifted
 *                       (e.g. FN llm-no-match → FN schema-mismatch)
 *
 * Passing rows that became different-phase passing rows are intentionally
 * invisible — we don't commit per-row predictions for passing rows.
 *
 * `fixtureChanged` flags row composition drift (size or sorted-id-hash
 * differs). When true, added/removed numbers can include rows that simply
 * appeared or disappeared from the fixture; the TUI shows a banner so the
 * reviewer reads the diff with that context.
 */
export function diffAgainstBaseline(input: {
  readonly currentFailures: readonly BaselineFailure[]
  readonly currentFixtureSize: number
  readonly currentRowIdsHash: string
  readonly baseline: Baseline
}): BaselineDiff {
  const baselineById = new Map(input.baseline.failures.map((f) => [f.id, f]))
  const currentById = new Map(input.currentFailures.map((f) => [f.id, f]))

  const addedFailures: BaselineFailure[] = []
  const changedFailures: FailureChange[] = []
  for (const [id, now] of currentById) {
    const was = baselineById.get(id)
    if (was === undefined) {
      addedFailures.push(now)
      continue
    }
    if (was.predicted !== now.predicted || was.phase !== now.phase) {
      changedFailures.push({
        id,
        was: { predicted: was.predicted, phase: was.phase, tags: was.tags },
        now: { predicted: now.predicted, phase: now.phase, tags: now.tags },
      })
    }
  }

  const removedFailures: BaselineFailure[] = []
  for (const [id, was] of baselineById) {
    if (!currentById.has(id)) removedFailures.push(was)
  }

  const fixtureChanged =
    input.currentFixtureSize !== input.baseline.fixtureSize || input.currentRowIdsHash !== input.baseline.rowIdsHash

  return { addedFailures, removedFailures, changedFailures, fixtureChanged }
}
