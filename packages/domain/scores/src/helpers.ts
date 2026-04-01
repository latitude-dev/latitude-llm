import type { Score } from "./entities/score.ts"

export const isImmutableScore = (score: Score): boolean =>
  score.draftedAt === null && (score.passed || score.errored || score.issueId !== null)

export const shouldDiscoverIssue = (score: Score): boolean =>
  score.draftedAt === null && !score.passed && !score.errored && score.issueId === null
