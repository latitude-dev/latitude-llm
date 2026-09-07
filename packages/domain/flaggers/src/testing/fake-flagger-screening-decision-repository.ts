import { Effect } from "effect"
import type { FlaggerScreeningDecision } from "../entities/flagger-screening-decision.ts"
import type { FlaggerScreeningDecisionRepositoryShape } from "../ports/flagger-screening-decision-repository.ts"

export const createFakeFlaggerScreeningDecisionRepository = (
  seed: readonly FlaggerScreeningDecision[] = [],
  overrides: Partial<FlaggerScreeningDecisionRepositoryShape> = {},
) => {
  const decisions = [...seed]
  const repository: FlaggerScreeningDecisionRepositoryShape = {
    saveMany: (rows) => Effect.sync(() => decisions.push(...rows)).pipe(Effect.asVoid),
    ...overrides,
  }
  return { decisions, repository }
}
