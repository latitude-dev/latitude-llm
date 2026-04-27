import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Metrics, Prediction } from "./metrics.ts"

export interface Baseline {
  readonly runAt: string
  readonly metrics: Metrics
  readonly predictions: readonly Prediction[]
}

interface Flip {
  readonly id: string
  readonly was: { predicted: boolean; phase: Prediction["phase"] }
  readonly now: { predicted: boolean; phase: Prediction["phase"] }
}

export async function readBaseline(path: string): Promise<Baseline | null> {
  try {
    await stat(path)
  } catch {
    return null
  }
  return JSON.parse(await readFile(path, "utf8")) as Baseline
}

export async function writeBaseline(path: string, baseline: Baseline): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(baseline, null, 2)}\n`)
}

/**
 * Compare the current run's predictions against a baseline, producing a list
 * of rows that flipped (changed `predicted` or `phase`). Rows present in
 * exactly one of (current, baseline) are reported separately so a sampled
 * run vs. a full baseline doesn't masquerade as massive regression.
 */
export function diffAgainstBaseline(
  current: readonly Prediction[],
  baseline: Baseline,
): {
  flips: readonly Flip[]
  missingFromCurrent: readonly string[]
  newInCurrent: readonly string[]
} {
  const baselineById = new Map(baseline.predictions.map((p) => [p.id, p]))
  const currentById = new Map(current.map((p) => [p.id, p]))

  const flips: Flip[] = []
  for (const [id, now] of currentById) {
    const was = baselineById.get(id)
    if (!was) continue
    if (was.predicted !== now.predicted || was.phase !== now.phase) {
      flips.push({
        id,
        was: { predicted: was.predicted, phase: was.phase },
        now: { predicted: now.predicted, phase: now.phase },
      })
    }
  }

  const missingFromCurrent: string[] = []
  for (const id of baselineById.keys()) if (!currentById.has(id)) missingFromCurrent.push(id)
  const newInCurrent: string[] = []
  for (const id of currentById.keys()) if (!baselineById.has(id)) newInCurrent.push(id)

  return { flips, missingFromCurrent, newInCurrent }
}
