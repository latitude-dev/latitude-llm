import type { ClickHouseClient } from "@clickhouse/client"
import {
  type SessionAnalysis,
  SessionAnalysisRepository,
  type SessionMomentLabel,
  SessionMomentLabelRepository,
  type SessionSemanticMoment,
  SessionSemanticMomentRepository,
  sessionAnalysisSchema,
  sessionMomentLabelSchema,
  sessionSemanticMomentSchema,
} from "@domain/conversation-intelligence"
import {
  ChSqlClient,
  type ChSqlClientShape,
  OrganizationId,
  ProjectId,
  SessionId,
  TraceId,
  toRepositoryError,
} from "@domain/shared"
import { Effect, Layer } from "effect"

const toClickhouseDateTime = (date: Date): string => date.toISOString().replace("Z", "")
const parseClickhouseDate = (value: string): Date => new Date(`${value.replace(" ", "T")}Z`)

type AnalysisRow = {
  readonly organization_id: string
  readonly project_id: string
  readonly session_id: string
  readonly start_time: string
  readonly end_time: string
  readonly trace_ids: readonly string[]
  readonly analysis_hash: string
  readonly analysis_status: string
  readonly status_reason: string
  readonly retention_days: number
  readonly indexed_at: string
}

type SemanticMomentRow = {
  readonly organization_id: string
  readonly project_id: string
  readonly session_id: string
  readonly analysis_hash: string
  readonly moment_id: string
  readonly trace_id: string
  readonly start_time: string
  readonly end_time: string
  readonly first_message_index: number
  readonly last_message_index: number
  readonly boundary_reason: string
  readonly embedding: readonly number[]
  readonly coherence_score: number
  readonly retention_days: number
  readonly indexed_at: string
}

type MomentLabelRow = {
  readonly organization_id: string
  readonly project_id: string
  readonly session_id: string
  readonly analysis_hash: string
  readonly label_id: string
  readonly moment_id: string
  readonly kind: string
  readonly actor: string
  readonly first_message_index: number
  readonly last_message_index: number
  readonly summary: string
  readonly evidence: string
  readonly confidence: number
  readonly retention_days: number
  readonly indexed_at: string
}

const analysisColumns = `
  organization_id,
  project_id,
  session_id,
  start_time,
  end_time,
  trace_ids,
  analysis_hash,
  analysis_status,
  status_reason,
  retention_days,
  indexed_at
`

const semanticMomentColumns = `
  organization_id,
  project_id,
  session_id,
  analysis_hash,
  moment_id,
  trace_id,
  start_time,
  end_time,
  first_message_index,
  last_message_index,
  boundary_reason,
  embedding,
  coherence_score,
  retention_days,
  indexed_at
`

const momentLabelColumns = `
  organization_id,
  project_id,
  session_id,
  analysis_hash,
  label_id,
  moment_id,
  kind,
  actor,
  first_message_index,
  last_message_index,
  summary,
  evidence,
  confidence,
  retention_days,
  indexed_at
`

const toAnalysisInsertRow = (analysis: SessionAnalysis) => ({
  organization_id: analysis.organizationId as string,
  project_id: analysis.projectId as string,
  session_id: analysis.sessionId as string,
  start_time: toClickhouseDateTime(analysis.startTime),
  end_time: toClickhouseDateTime(analysis.endTime),
  trace_ids: [...analysis.traceIds],
  analysis_hash: analysis.analysisHash,
  analysis_status: analysis.analysisStatus,
  status_reason: analysis.statusReason,
  retention_days: analysis.retentionDays,
  indexed_at: toClickhouseDateTime(analysis.indexedAt),
})

const toSemanticMomentInsertRow = (moment: SessionSemanticMoment) => ({
  organization_id: moment.organizationId as string,
  project_id: moment.projectId as string,
  session_id: moment.sessionId as string,
  analysis_hash: moment.analysisHash,
  moment_id: moment.momentId,
  trace_id: moment.traceId as string,
  start_time: toClickhouseDateTime(moment.startTime),
  end_time: toClickhouseDateTime(moment.endTime),
  first_message_index: moment.firstMessageIndex,
  last_message_index: moment.lastMessageIndex,
  boundary_reason: moment.boundaryReason,
  embedding: [...moment.embedding],
  coherence_score: moment.coherenceScore,
  retention_days: moment.retentionDays,
  indexed_at: toClickhouseDateTime(moment.indexedAt),
})

const toMomentLabelInsertRow = (label: SessionMomentLabel) => ({
  organization_id: label.organizationId as string,
  project_id: label.projectId as string,
  session_id: label.sessionId as string,
  analysis_hash: label.analysisHash,
  label_id: label.labelId,
  moment_id: label.momentId,
  kind: label.kind,
  actor: label.actor,
  first_message_index: label.firstMessageIndex,
  last_message_index: label.lastMessageIndex,
  summary: label.summary,
  evidence: label.evidence,
  confidence: label.confidence,
  retention_days: label.retentionDays,
  indexed_at: toClickhouseDateTime(label.indexedAt),
})

const toDomainAnalysis = (row: AnalysisRow): SessionAnalysis =>
  sessionAnalysisSchema.parse({
    organizationId: OrganizationId(row.organization_id),
    projectId: ProjectId(row.project_id),
    sessionId: SessionId(row.session_id),
    startTime: parseClickhouseDate(row.start_time),
    endTime: parseClickhouseDate(row.end_time),
    traceIds: row.trace_ids.map(TraceId),
    analysisHash: row.analysis_hash,
    analysisStatus: row.analysis_status,
    statusReason: row.status_reason,
    retentionDays: row.retention_days,
    indexedAt: parseClickhouseDate(row.indexed_at),
  })

const toDomainSemanticMoment = (row: SemanticMomentRow): SessionSemanticMoment =>
  sessionSemanticMomentSchema.parse({
    organizationId: OrganizationId(row.organization_id),
    projectId: ProjectId(row.project_id),
    sessionId: SessionId(row.session_id),
    analysisHash: row.analysis_hash,
    momentId: row.moment_id,
    traceId: TraceId(row.trace_id),
    startTime: parseClickhouseDate(row.start_time),
    endTime: parseClickhouseDate(row.end_time),
    firstMessageIndex: row.first_message_index,
    lastMessageIndex: row.last_message_index,
    boundaryReason: row.boundary_reason,
    embedding: row.embedding,
    coherenceScore: row.coherence_score,
    retentionDays: row.retention_days,
    indexedAt: parseClickhouseDate(row.indexed_at),
  })

const toDomainMomentLabel = (row: MomentLabelRow): SessionMomentLabel =>
  sessionMomentLabelSchema.parse({
    organizationId: OrganizationId(row.organization_id),
    projectId: ProjectId(row.project_id),
    sessionId: SessionId(row.session_id),
    analysisHash: row.analysis_hash,
    labelId: row.label_id,
    momentId: row.moment_id,
    kind: row.kind,
    actor: row.actor,
    firstMessageIndex: row.first_message_index,
    lastMessageIndex: row.last_message_index,
    summary: row.summary,
    evidence: row.evidence,
    confidence: row.confidence,
    retentionDays: row.retention_days,
    indexedAt: parseClickhouseDate(row.indexed_at),
  })

export const SessionAnalysisRepositoryLive = Layer.effect(
  SessionAnalysisRepository,
  Effect.gen(function* () {
    return {
      findLatest: ({ organizationId, projectId, sessionId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${analysisColumns}
                        FROM session_analyses FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND session_id = {sessionId:String}
                        LIMIT 1`,
                query_params: { organizationId: organizationId as string, projectId: projectId as string, sessionId },
                format: "JSONEachRow",
              })
              const rows = (await result.json()) as AnalysisRow[]
              const row = rows[0]
              return row ? toDomainAnalysis(row) : null
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "SessionAnalysisRepository.findLatest")))
        }),
      upsert: (analysis) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.insert({
                table: "session_analyses",
                values: [toAnalysisInsertRow(analysis)],
                format: "JSONEachRow",
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "SessionAnalysisRepository.upsert")))
        }),
    }
  }),
)

export const SessionSemanticMomentRepositoryLive = Layer.effect(
  SessionSemanticMomentRepository,
  Effect.gen(function* () {
    return {
      upsertMany: (moments) =>
        Effect.gen(function* () {
          if (moments.length === 0) return
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.insert({
                table: "session_semantic_moments",
                values: moments.map(toSemanticMomentInsertRow),
                format: "JSONEachRow",
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "SessionSemanticMomentRepository.upsertMany")))
        }),
      listBySession: ({ organizationId, projectId, sessionId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${semanticMomentColumns}
                        FROM session_semantic_moments FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND session_id = {sessionId:String}
                        ORDER BY first_message_index ASC, moment_id ASC`,
                query_params: { organizationId: organizationId as string, projectId: projectId as string, sessionId },
                format: "JSONEachRow",
              })
              return ((await result.json()) as SemanticMomentRow[]).map(toDomainSemanticMoment)
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "SessionSemanticMomentRepository.listBySession")))
        }),
      listByTrace: ({ organizationId, projectId, traceId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${semanticMomentColumns}
                        FROM session_semantic_moments FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND trace_id = {traceId:FixedString(32)}
                        ORDER BY first_message_index ASC, moment_id ASC`,
                query_params: { organizationId: organizationId as string, projectId: projectId as string, traceId },
                format: "JSONEachRow",
              })
              return ((await result.json()) as SemanticMomentRow[]).map(toDomainSemanticMoment)
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "SessionSemanticMomentRepository.listByTrace")))
        }),
    }
  }),
)

export const SessionMomentLabelRepositoryLive = Layer.effect(
  SessionMomentLabelRepository,
  Effect.gen(function* () {
    return {
      upsertMany: (labels) =>
        Effect.gen(function* () {
          if (labels.length === 0) return
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.insert({
                table: "session_moment_labels",
                values: labels.map(toMomentLabelInsertRow),
                format: "JSONEachRow",
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "SessionMomentLabelRepository.upsertMany")))
        }),
      listBySession: ({ organizationId, projectId, sessionId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${momentLabelColumns}
                        FROM session_moment_labels FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND session_id = {sessionId:String}
                        ORDER BY first_message_index ASC, kind ASC, label_id ASC`,
                query_params: { organizationId: organizationId as string, projectId: projectId as string, sessionId },
                format: "JSONEachRow",
              })
              return ((await result.json()) as MomentLabelRow[]).map(toDomainMomentLabel)
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "SessionMomentLabelRepository.listBySession")))
        }),
      listByMoment: ({ organizationId, projectId, sessionId, momentId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${momentLabelColumns}
                        FROM session_moment_labels FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND session_id = {sessionId:String}
                          AND moment_id = {momentId:String}
                        ORDER BY first_message_index ASC, kind ASC, label_id ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  sessionId,
                  momentId,
                },
                format: "JSONEachRow",
              })
              return ((await result.json()) as MomentLabelRow[]).map(toDomainMomentLabel)
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "SessionMomentLabelRepository.listByMoment")))
        }),
    }
  }),
)
