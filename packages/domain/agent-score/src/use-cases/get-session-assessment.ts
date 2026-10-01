import { BadRequestError, NotFoundError, type OrganizationId, type ProjectId, type SessionId } from "@domain/shared"
import { Effect } from "effect"
import { decodeSessionAssessmentCursor } from "../pagination/session-assessment-cursor.ts"
import { readSessionAssessmentInputBatch } from "../readers/read-session-assessment-batch.ts"
import { resolveSessionAssessmentPage } from "../resolver/resolve-session-assessment.ts"

export interface GetSessionAssessmentInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId
  readonly cursor?: string
}

export const getSessionAssessment = Effect.fn("agentScore.getSessionAssessment")(function* (
  input: GetSessionAssessmentInput,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("sessionId", input.sessionId)

  const cursor = input.cursor ? decodeSessionAssessmentCursor(input.cursor) : undefined
  if (input.cursor && !cursor) return yield* new BadRequestError({ message: "Invalid session assessment cursor" })
  const cutoff = cursor ? new Date(cursor.cutoff) : new Date()
  const [assessment] = yield* readSessionAssessmentInputBatch({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionIds: [input.sessionId],
    cutoff,
  })

  if (!assessment) return yield* new NotFoundError({ entity: "Session", id: input.sessionId })
  return resolveSessionAssessmentPage(assessment, { cutoff, ...(cursor ? { cursor } : {}) })
})
