import { providerModelCohortId } from "@domain/spans"
import type {
  LatencyReferenceArtifact,
  ProvisionalThroughputReference,
  ProvisionalTtftReference,
  ThroughputReferenceCohort,
  TtftReferenceCohort,
} from "../entities/latency-reference-artifact.ts"

interface PublishedLatencyFigure {
  readonly provider: string
  readonly model: string
  readonly ttftMs: number
  readonly tokensPerSecond: number
}

// Published vendor figures. Hand-maintained; the calibration script imports this module rather than regenerating it.
const PROVISIONAL_PUBLISHED_FIGURES: readonly PublishedLatencyFigure[] = [
  { provider: "openai", model: "gpt-4.1", ttftMs: 450, tokensPerSecond: 95 },
  { provider: "openai", model: "gpt-4.1-mini", ttftMs: 330, tokensPerSecond: 130 },
  { provider: "openai", model: "gpt-4o", ttftMs: 480, tokensPerSecond: 90 },
  { provider: "openai", model: "gpt-4o-mini", ttftMs: 350, tokensPerSecond: 120 },
  { provider: "openai", model: "gpt-5", ttftMs: 700, tokensPerSecond: 75 },
  { provider: "openai", model: "gpt-5-mini", ttftMs: 520, tokensPerSecond: 110 },
  { provider: "openai", model: "gpt-5-nano", ttftMs: 380, tokensPerSecond: 150 },
  { provider: "openai", model: "gpt-5-pro", ttftMs: 1_200, tokensPerSecond: 45 },
  { provider: "anthropic", model: "claude-opus-4-5", ttftMs: 900, tokensPerSecond: 60 },
  { provider: "anthropic", model: "claude-sonnet-4-5", ttftMs: 600, tokensPerSecond: 85 },
  { provider: "anthropic", model: "claude-haiku-4-5", ttftMs: 380, tokensPerSecond: 140 },
  { provider: "google", model: "gemini-2.5-pro", ttftMs: 800, tokensPerSecond: 70 },
  { provider: "google", model: "gemini-2.5-flash", ttftMs: 420, tokensPerSecond: 130 },
  { provider: "google", model: "gemini-2.5-flash-lite", ttftMs: 300, tokensPerSecond: 180 },
]

const MILLISECOND_NS = 1_000_000

const measuredPairs = (cohorts: readonly (TtftReferenceCohort | ThroughputReferenceCohort)[]): ReadonlySet<string> =>
  new Set(
    cohorts.filter((cohort) => cohort.granularity === "providerModel").map((cohort) => providerModelCohortId(cohort)),
  )

/** The published figures for every pair the calibrated cohorts do not measure, per metric. */
export const provisionalFallbackFor = ({
  ttft,
  throughput,
}: {
  readonly ttft: readonly TtftReferenceCohort[]
  readonly throughput: readonly ThroughputReferenceCohort[]
}): NonNullable<LatencyReferenceArtifact["provisionalFallback"]> => {
  const measuredTtft = measuredPairs(ttft)
  const measuredThroughput = measuredPairs(throughput)
  const ttftFallback: ProvisionalTtftReference[] = PROVISIONAL_PUBLISHED_FIGURES.filter(
    (pair) => !measuredTtft.has(providerModelCohortId(pair)),
  ).map((pair) => ({ provider: pair.provider, model: pair.model, medianTtftNs: pair.ttftMs * MILLISECOND_NS }))
  const throughputFallback: ProvisionalThroughputReference[] = PROVISIONAL_PUBLISHED_FIGURES.filter(
    (pair) => !measuredThroughput.has(providerModelCohortId(pair)),
  ).map((pair) => ({ provider: pair.provider, model: pair.model, medianTokensPerSecond: pair.tokensPerSecond }))
  return { ttft: ttftFallback, throughput: throughputFallback }
}
