import type { FlaggerFindingKey, Score, ScoringArtifactVersion } from "./entities/score.ts"

export type FlaggerScoreProvenanceRead =
  | { readonly status: "not-flagger" }
  | { readonly status: "legacy"; readonly flaggerSlug: string }
  | {
      readonly status: "compatible"
      readonly flaggerSlug: string
      readonly flaggerPath: "deterministic"
      readonly flaggerFindingKey: FlaggerFindingKey
    }
  | {
      readonly status: "compatible"
      readonly flaggerSlug: string
      readonly flaggerPath: "sampled"
      readonly scoringArtifactVersion: ScoringArtifactVersion
    }

export const readFlaggerScoreProvenance = (score: Score): FlaggerScoreProvenanceRead => {
  if (score.sourceType !== "annotation" || score.sourceId !== "SYSTEM" || score.metadata.flaggerSlug === undefined) {
    return { status: "not-flagger" }
  }

  const { flaggerSlug, flaggerPath, flaggerFindingKey, scoringArtifactVersion } = score.metadata

  if (flaggerPath === "deterministic" && flaggerFindingKey !== undefined && scoringArtifactVersion === undefined) {
    return { status: "compatible", flaggerSlug, flaggerPath, flaggerFindingKey }
  }

  if (flaggerPath === "sampled" && scoringArtifactVersion !== undefined && flaggerFindingKey === undefined) {
    return { status: "compatible", flaggerSlug, flaggerPath, scoringArtifactVersion }
  }

  return { status: "legacy", flaggerSlug }
}

export const isImmutableScore = (score: Score): boolean =>
  // an evaluation run is final on arrival regardless of its verdict — absent runs (passed=false, no signal_id) still sync as denominators
  score.draftedAt === null &&
  (score.sourceType === "evaluation" || score.passed || score.errored || score.signalId !== null)
