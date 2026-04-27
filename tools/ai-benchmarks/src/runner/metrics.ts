export interface Prediction {
  readonly id: string
  readonly expected: boolean
  readonly predicted: boolean
  readonly phase:
    | "deterministic-match"
    | "deterministic-no-match"
    | "llm-match"
    | "llm-no-match"
    | "schema-mismatch"
    | "error"
  readonly tags: readonly string[]
  /** Populated only when phase === "error". Short one-line excerpt for the report. */
  readonly errorMessage?: string
}

export interface Metrics {
  readonly truePositives: number
  readonly falsePositives: number
  readonly trueNegatives: number
  readonly falseNegatives: number
  readonly precision: number
  readonly recall: number
  readonly f1: number
  readonly accuracy: number
  readonly total: number
}

const nan = Number.NaN

function safeDiv(n: number, d: number): number {
  return d === 0 ? nan : n / d
}

/**
 * Compute precision/recall/F1/accuracy from a list of predictions.
 *
 * `safeDiv` returns `NaN` when a denominator is zero (no positives predicted,
 * no positives expected, etc.). The reporter renders `NaN` as "n/a" so a
 * subsetted run on all-negative rows doesn't crash.
 */
export function computeMetrics(predictions: readonly Prediction[]): Metrics {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  for (const p of predictions) {
    if (p.predicted && p.expected) tp++
    else if (p.predicted && !p.expected) fp++
    else if (!p.predicted && !p.expected) tn++
    else fn++
  }
  const precision = safeDiv(tp, tp + fp)
  const recall = safeDiv(tp, tp + fn)
  const f1 = safeDiv(2 * precision * recall, precision + recall)
  const accuracy = safeDiv(tp + tn, predictions.length)
  return {
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    precision,
    recall,
    f1,
    accuracy,
    total: predictions.length,
  }
}

/**
 * Group predictions by a string key (tag, decision phase, etc.) and compute
 * per-group metrics. Groups with no matching predictions are omitted.
 */
export function computeMetricsBy<K extends string>(
  predictions: readonly Prediction[],
  key: (p: Prediction) => K | readonly K[],
): Record<K, Metrics> {
  const buckets: Record<string, Prediction[]> = {}
  for (const p of predictions) {
    const k = key(p)
    const keys = Array.isArray(k) ? k : [k as K]
    for (const single of keys) {
      buckets[single as string] ??= []
      buckets[single as string].push(p)
    }
  }
  const out: Record<string, Metrics> = {}
  for (const [k, bucket] of Object.entries(buckets)) {
    out[k] = computeMetrics(bucket)
  }
  return out as Record<K, Metrics>
}

export function countByPhase(predictions: readonly Prediction[]): Record<Prediction["phase"], number> {
  const counts: Record<Prediction["phase"], number> = {
    "deterministic-match": 0,
    "deterministic-no-match": 0,
    "llm-match": 0,
    "llm-no-match": 0,
    "schema-mismatch": 0,
    error: 0,
  }
  for (const p of predictions) counts[p.phase]++
  return counts
}

/**
 * How a slice of predictions should be summarised.
 *
 * - `pr` — mixed or all-positive; P/R/F1 are meaningful
 * - `negatives-only` — every row has `expected=false`; only FPR is meaningful
 *   (P/R are 0/0 or 0/FP, F1 falls out undefined). Common on our hard-negative
 *   and benign slices.
 * - `positives-only` — every row has `expected=true`; precision is undefined
 *   (no FP is possible by definition); recall is meaningful but we also
 *   surface the miss count directly.
 */
type SliceShape = "pr" | "negatives-only" | "positives-only"

export function classifySlice(m: Metrics): SliceShape {
  const expectedPositives = m.truePositives + m.falseNegatives
  const expectedNegatives = m.trueNegatives + m.falsePositives
  if (expectedPositives === 0) return "negatives-only"
  if (expectedNegatives === 0) return "positives-only"
  return "pr"
}

/** FP / (FP + TN) — fraction of negatives the flagger wrongly flagged. */
export function falsePositiveRate(m: Metrics): number {
  return safeDiv(m.falsePositives, m.falsePositives + m.trueNegatives)
}
