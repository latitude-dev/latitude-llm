import { Effect } from "effect"

export interface RetrieveAndRerankInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
}

export interface RetrievalResult {
  readonly matchedIssueId: string | null
  readonly similarityScore: number
}

export const retrieveAndRerankUseCase = (_input: RetrieveAndRerankInput) =>
  Effect.gen(function* () {
    yield* Effect.sleep("1 seconds")

    const result = { matchedIssueId: null, similarityScore: 0.2 } satisfies RetrievalResult
    return result
  })
