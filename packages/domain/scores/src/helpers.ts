import type { Score } from "./entities/score.ts"

export const isImmutableScore = (score: Score): boolean =>
  // an evaluation run is final on arrival regardless of its verdict — absent runs (passed=false, no signal_id) still sync as denominators
  score.draftedAt === null &&
  (score.sourceType === "evaluation" || score.passed || score.errored || score.signalId !== null)
