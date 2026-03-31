import { Effect } from "effect"

export interface AssignmentResult {
  readonly issueId: string
  readonly action: "created" | "assigned"
}

export const createOrAssignIssueUseCase = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly matchedIssueId: string | null
}) =>
  Effect.gen(function* () {
    yield* Effect.sleep("500 millis")

    const action = input.matchedIssueId ? ("assigned" as const) : ("created" as const)
    const issueId = input.matchedIssueId ?? `issue-${Date.now()}`

    return { issueId, action } satisfies AssignmentResult
  })
