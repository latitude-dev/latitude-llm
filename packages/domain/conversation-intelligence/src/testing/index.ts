import type { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { Effect } from "effect"
import type { SessionAnalysis } from "../entities/session-analysis.ts"
import type { SessionMomentLabel } from "../entities/session-moment-label.ts"
import type { SessionSemanticMoment } from "../entities/session-semantic-moment.ts"
import type { SessionAnalysisRepositoryShape } from "../ports/session-analysis-repository.ts"
import type { SessionMomentLabelRepositoryShape } from "../ports/session-moment-label-repository.ts"
import type { SessionSemanticMomentRepositoryShape } from "../ports/session-semantic-moment-repository.ts"

const analysisKey = (organizationId: OrganizationId, projectId: ProjectId, sessionId: SessionId) =>
  `${organizationId}|${projectId}|${sessionId}`

export const createFakeSessionAnalysisRepository = (
  seed: readonly SessionAnalysis[] = [],
  overrides?: Partial<SessionAnalysisRepositoryShape>,
) => {
  const rows = new Map(seed.map((row) => [analysisKey(row.organizationId, row.projectId, row.sessionId), row] as const))
  const repository: SessionAnalysisRepositoryShape = {
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

export const createFakeSessionSemanticMomentRepository = (seed: readonly SessionSemanticMoment[] = []) => {
  const rows: SessionSemanticMoment[] = [...seed]
  const repository: SessionSemanticMomentRepositoryShape = {
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

export const createFakeSessionMomentLabelRepository = (seed: readonly SessionMomentLabel[] = []) => {
  const rows: SessionMomentLabel[] = [...seed]
  const repository: SessionMomentLabelRepositoryShape = {
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
