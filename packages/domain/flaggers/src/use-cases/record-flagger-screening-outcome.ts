import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { FlaggerScreeningOutcome, FlaggerScreeningSelection } from "../entities/flagger-screening-decision.ts"
import { FlaggerScreeningDecisionRepository } from "../ports/flagger-screening-decision-repository.ts"

export interface RecordFlaggerScreeningOutcomeInput {
  readonly selection: FlaggerScreeningSelection
  readonly attempt: number
  readonly outcome: FlaggerScreeningOutcome
}

export const recordFlaggerScreeningOutcomeUseCase = Effect.fn("flaggers.recordScreeningOutcome")(function* (
  input: RecordFlaggerScreeningOutcomeInput,
) {
  const repository = yield* FlaggerScreeningDecisionRepository
  yield* repository.saveMany([
    {
      ...input.selection,
      attempt: input.attempt,
      version: 2,
      outcome: input.outcome,
      createdAt: new Date(),
    },
  ])
})

export type RecordFlaggerScreeningOutcomeError = RepositoryError
