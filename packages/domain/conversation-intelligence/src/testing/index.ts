import type { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { Effect } from "effect"
import type { ConversationMomentLabel } from "../entities/moment-label.ts"
import type { ConversationSemanticMoment } from "../entities/semantic-moment.ts"
import type { ConversationSessionAnalysis } from "../entities/session-analysis.ts"
import type { ConversationMomentLabelRepositoryShape } from "../ports/moment-label-repository.ts"
import type { ConversationSemanticMomentRepositoryShape } from "../ports/semantic-moment-repository.ts"
import type { ConversationSessionAnalysisRepositoryShape } from "../ports/session-analysis-repository.ts"

const analysisKey = (organizationId: OrganizationId, projectId: ProjectId, sessionId: SessionId) =>
  `${organizationId}|${projectId}|${sessionId}`

export const createFakeConversationSessionAnalysisRepository = (
  seed: readonly ConversationSessionAnalysis[] = [],
  overrides?: Partial<ConversationSessionAnalysisRepositoryShape>,
) => {
  const rows = new Map(seed.map((row) => [analysisKey(row.organizationId, row.projectId, row.sessionId), row] as const))
  const repository: ConversationSessionAnalysisRepositoryShape = {
    findLatest: ({ organizationId, projectId, sessionId }) =>
      Effect.sync(() => rows.get(analysisKey(organizationId, projectId, sessionId)) ?? null),
    upsert: (analysis) =>
      Effect.sync(() => {
        rows.set(analysisKey(analysis.organizationId, analysis.projectId, analysis.sessionId), analysis)
      }),
    ...overrides,
  }
  return { repository, rows }
}

export const createFakeConversationSemanticMomentRepository = (seed: readonly ConversationSemanticMoment[] = []) => {
  const rows: ConversationSemanticMoment[] = [...seed]
  const repository: ConversationSemanticMomentRepositoryShape = {
    upsertMany: (moments) =>
      Effect.sync(() => {
        rows.push(...moments)
      }),
    listBySession: ({ organizationId, projectId, sessionId }) =>
      Effect.sync(() =>
        rows.filter(
          (moment) =>
            moment.organizationId === organizationId &&
            moment.projectId === projectId &&
            moment.sessionId === sessionId,
        ),
      ),
    listByTrace: ({ organizationId, projectId, traceId }) =>
      Effect.sync(() =>
        rows.filter(
          (moment) =>
            moment.organizationId === organizationId && moment.projectId === projectId && moment.traceId === traceId,
        ),
      ),
  }
  return { repository, rows }
}

export const createFakeConversationMomentLabelRepository = (seed: readonly ConversationMomentLabel[] = []) => {
  const rows: ConversationMomentLabel[] = [...seed]
  const repository: ConversationMomentLabelRepositoryShape = {
    upsertMany: (labels) =>
      Effect.sync(() => {
        rows.push(...labels)
      }),
    listBySession: ({ organizationId, projectId, sessionId }) =>
      Effect.sync(() =>
        rows.filter(
          (label) =>
            label.organizationId === organizationId && label.projectId === projectId && label.sessionId === sessionId,
        ),
      ),
    listByMoment: ({ organizationId, projectId, sessionId, momentId }) =>
      Effect.sync(() =>
        rows.filter(
          (label) =>
            label.organizationId === organizationId &&
            label.projectId === projectId &&
            label.sessionId === sessionId &&
            label.momentId === momentId,
        ),
      ),
  }
  return { repository, rows }
}
