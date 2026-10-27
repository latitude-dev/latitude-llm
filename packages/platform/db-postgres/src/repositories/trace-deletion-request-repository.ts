import { NotFoundError, SqlClient, type SqlClientShape, type TraceDeletionRequestId } from "@domain/shared"
import {
  type TraceDeletionRequest,
  TraceDeletionRequestRepository,
  type TraceDeletionRequestRepositoryShape,
  traceDeletionRequestSchema,
} from "@domain/spans"
import { and, desc, eq, lt, or } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { traceDeletionRequests } from "../schema/trace-deletion-requests.ts"

type Row = typeof traceDeletionRequests.$inferSelect

const toDomain = (row: Row): TraceDeletionRequest =>
  traceDeletionRequestSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    filters: row.filters,
    includeDatasetRows: row.includeDatasetRows,
    status: row.status,
    requestedBy: row.requestedBy,
    matchedTraceCount: row.matchedTraceCount,
    deletedRowCounts: row.deletedRowCounts,
    error: row.error,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toInsertRow = (request: TraceDeletionRequest, organizationId: string) => ({
  id: request.id,
  organizationId,
  projectId: request.projectId,
  filters: request.filters,
  includeDatasetRows: request.includeDatasetRows,
  status: request.status,
  requestedBy: request.requestedBy,
  matchedTraceCount: request.matchedTraceCount,
  deletedRowCounts: request.deletedRowCounts,
  error: request.error,
  startedAt: request.startedAt,
  completedAt: request.completedAt,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
})

const encodeCursor = (request: Pick<TraceDeletionRequest, "createdAt" | "id">) =>
  Buffer.from(JSON.stringify([request.createdAt.toISOString(), request.id])).toString("base64url")

const decodeCursor = (cursor: string): { readonly createdAt: Date; readonly id: string } | null => {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [string, string]
    const date = new Date(createdAt)
    return Number.isNaN(date.getTime()) || typeof id !== "string" ? null : { createdAt: date, id }
  } catch {
    return null
  }
}

export const TraceDeletionRequestRepositoryLive = Layer.succeed(TraceDeletionRequestRepository, {
  findById: (id: TraceDeletionRequestId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const [row] = yield* sqlClient.query((db, organizationId) =>
        db
          .select()
          .from(traceDeletionRequests)
          .where(and(eq(traceDeletionRequests.organizationId, organizationId), eq(traceDeletionRequests.id, id)))
          .limit(1),
      )
      if (!row) return yield* new NotFoundError({ entity: "TraceDeletionRequest", id })
      return toDomain(row)
    }),

  listByProjectId: ({ projectId, limit, cursor }) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const after = cursor ? decodeCursor(cursor) : null
      const rows = yield* sqlClient.query((db, organizationId) =>
        db
          .select()
          .from(traceDeletionRequests)
          .where(
            and(
              eq(traceDeletionRequests.organizationId, organizationId),
              eq(traceDeletionRequests.projectId, projectId),
              after
                ? or(
                    lt(traceDeletionRequests.createdAt, after.createdAt),
                    and(eq(traceDeletionRequests.createdAt, after.createdAt), lt(traceDeletionRequests.id, after.id)),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(traceDeletionRequests.createdAt), desc(traceDeletionRequests.id))
          .limit(limit + 1),
      )
      const items = rows.slice(0, limit).map(toDomain)
      const last = items.at(-1)
      return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null }
    }),

  save: (request: TraceDeletionRequest) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      yield* sqlClient.query((db, organizationId) => {
        const row = toInsertRow(request, organizationId)
        const { id: _id, organizationId: _organizationId, createdAt: _createdAt, ...updatable } = row
        return db
          .insert(traceDeletionRequests)
          .values(row)
          .onConflictDoUpdate({ target: traceDeletionRequests.id, set: updatable })
      })
    }),
} satisfies TraceDeletionRequestRepositoryShape)
