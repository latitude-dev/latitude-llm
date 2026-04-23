import type { FixtureRow } from "../types.ts"

const DEFAULT_SEED = 0xbeefcafe

/**
 * A small deterministic PRNG (mulberry32). Seeded by an integer, produces a
 * stable sequence of floats in [0, 1). Same seed → same sequence, so a
 * sampled run is reproducible across machines.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

/**
 * Stratified sample across the two expected-label buckets. For `size=30`:
 * take 15 from the positives pool (`expected.matched=true`) and 15 from
 * negatives (`expected.matched=false`). If either pool has fewer rows than
 * its quota, we take all of them — the caller sees fewer rows than requested
 * but never empty metrics.
 */
export function stratifiedSample(rows: readonly FixtureRow[], size: number, seed = DEFAULT_SEED): FixtureRow[] {
  if (size >= rows.length) return [...rows]
  const rng = mulberry32(seed)

  const positives = rows.filter((r) => r.expected.matched)
  const negatives = rows.filter((r) => !r.expected.matched)

  const halfPos = Math.min(positives.length, Math.floor(size / 2))
  const halfNeg = Math.min(negatives.length, size - halfPos)

  const picked = [...shuffled(positives, rng).slice(0, halfPos), ...shuffled(negatives, rng).slice(0, halfNeg)]
  // Interleave the final order so list consumers see a mix, not "positives
  // first then negatives".
  return shuffled(picked, rng)
}
