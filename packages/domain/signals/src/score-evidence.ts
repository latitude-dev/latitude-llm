import { SIGNAL_FLAGGER_SLUG_SAMPLE_LIMIT } from "@domain/scores"
import type { SignalScoreEvidence } from "./entities/signal.ts"

const signalScoreEvidenceByFlaggerSlug = {
  "task-success": [{ scoreDimension: "outcome", role: "taskOutcome" }],
  "tool-call-errors": [
    { scoreDimension: "reliability", role: "operationalIncident" },
    { scoreDimension: "cost", role: "spendEfficiency" },
    { scoreDimension: "speed", role: "criticalPathEfficiency" },
  ],
  "output-schema-validation": [
    { scoreDimension: "outcome", role: "taskOutcome" },
    { scoreDimension: "reliability", role: "completionOutcome" },
  ],
  "empty-response": [
    { scoreDimension: "outcome", role: "taskOutcome" },
    { scoreDimension: "reliability", role: "completionOutcome" },
  ],
  trashing: [
    { scoreDimension: "cost", role: "spendEfficiency" },
    { scoreDimension: "speed", role: "criticalPathEfficiency" },
  ],
  "low-cache-hit-rate": [{ scoreDimension: "cost", role: "spendEfficiency" }],
  forgetting: [
    { scoreDimension: "outcome", role: "taskOutcome" },
    { scoreDimension: "cost", role: "spendEfficiency" },
  ],
  bluffing: [{ scoreDimension: "outcome", role: "taskOutcome" }],
  incompletion: [{ scoreDimension: "outcome", role: "taskOutcome" }],
  laziness: [
    { scoreDimension: "outcome", role: "taskOutcome" },
    { scoreDimension: "speed", role: "criticalPathEfficiency" },
  ],
  refusal: [{ scoreDimension: "outcome", role: "taskOutcome" }],
  frustration: [{ scoreDimension: "outcome", role: "taskOutcome" }],
  "pii-leakage": [
    { scoreDimension: "safety", role: "confirmedHarm" },
    { scoreDimension: "safety", role: "exposure" },
  ],
  jailbreaking: [
    { scoreDimension: "safety", role: "confirmedHarm" },
    { scoreDimension: "safety", role: "exposure" },
  ],
  nsfw: [{ scoreDimension: "safety", role: "exposure" }],
} as const satisfies Record<string, readonly SignalScoreEvidence[]>

export type MappedSignalFlaggerSlug = keyof typeof signalScoreEvidenceByFlaggerSlug

export const isMappedSignalFlaggerSlug = (slug: string): slug is MappedSignalFlaggerSlug =>
  Object.hasOwn(signalScoreEvidenceByFlaggerSlug, slug)

export const getSignalScoreEvidenceForFlagger = (slug: string): SignalScoreEvidence[] | null => {
  if (!isMappedSignalFlaggerSlug(slug)) return null
  return signalScoreEvidenceByFlaggerSlug[slug].map((evidence) => ({ ...evidence }))
}

export const findDominantMappedSignalFlaggerSlug = (
  flaggerSlugsNewestFirst: readonly (string | null | undefined)[],
): MappedSignalFlaggerSlug | null => {
  const sample = flaggerSlugsNewestFirst.slice(0, SIGNAL_FLAGGER_SLUG_SAMPLE_LIMIT)
  if (sample.length === 0) return null

  const counts = new Map<string, number>()
  let mostFrequentSlug: string | null = null
  let mostFrequentCount = 0

  for (const slug of sample) {
    if (slug === null || slug === undefined) continue
    const count = (counts.get(slug) ?? 0) + 1
    counts.set(slug, count)
    if (count > mostFrequentCount) {
      mostFrequentSlug = slug
      mostFrequentCount = count
    }
  }

  if (mostFrequentSlug === null || mostFrequentCount * 2 <= sample.length) return null
  return isMappedSignalFlaggerSlug(mostFrequentSlug) ? mostFrequentSlug : null
}
