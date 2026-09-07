import { NotFoundError, type OrganizationId, type ProjectId, type SessionId } from "@domain/shared"
import { Effect } from "effect"
import { readSessionAssessmentBatch } from "../readers/read-session-assessment-batch.ts"

export interface GetSessionAssessmentInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId
}

export const getSessionAssessment = Effect.fn("agentScore.getSessionAssessment")(function* (
  input: GetSessionAssessmentInput,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("sessionId", input.sessionId)

  const [assessment] = yield* readSessionAssessmentBatch({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionIds: [input.sessionId],
    cutoff: new Date(),
  })

  if (!assessment) return yield* new NotFoundError({ entity: "Session", id: input.sessionId })
  return assessment
})
