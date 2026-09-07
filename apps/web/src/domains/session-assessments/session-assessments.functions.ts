import { getSessionAssessment, type SessionAssessment } from "@domain/agent-score"
import { ProjectId, SessionId } from "@domain/shared"
import {
  FlaggerScreeningDecisionRepositoryLive,
  SessionAnalysisRepositoryLive,
  SessionAssessmentBulkTelemetrySourceLive,
  SessionMomentLabelRepositoryLive,
  SessionRepositoryLive,
  SessionSemanticMomentRepositoryLive,
  SpanRepositoryLive,
} from "@platform/db-clickhouse"
import {
  ScoreRepositoryLive,
  SessionAssessmentBulkJudgmentSourceLive,
  SignalRepositoryLive,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"

const telemetryLayer = SessionAssessmentBulkTelemetrySourceLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      SessionRepositoryLive,
      SpanRepositoryLive,
      SessionAnalysisRepositoryLive,
      SessionSemanticMomentRepositoryLive,
      SessionMomentLabelRepositoryLive,
      FlaggerScreeningDecisionRepositoryLive,
    ),
  ),
)

const judgmentLayer = SessionAssessmentBulkJudgmentSourceLive.pipe(
  Layer.provideMerge(Layer.mergeAll(ScoreRepositoryLive, SignalRepositoryLive)),
)

export const getSessionAssessmentPage = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      sessionId: z.string().min(1).max(128),
      cursor: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<SessionAssessment> => {
    const organizationId = await resolveOrgScope(context)

    return await Effect.runPromise(
      getSessionAssessment({
        organizationId,
        projectId: ProjectId(data.projectId),
        sessionId: SessionId(data.sessionId),
        ...(data.cursor ? { cursor: data.cursor } : {}),
      }).pipe(
        withScopedPostgres(judgmentLayer, getPostgresClient(), organizationId),
        withScopedClickHouse(telemetryLayer, getClickhouseClient(), organizationId),
        withTracing,
      ),
    )
  })
