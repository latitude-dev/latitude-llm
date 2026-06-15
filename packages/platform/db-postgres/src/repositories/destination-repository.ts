import {
  DESTINATION_IDLE_BACKOFF_MAX_MS,
  type Destination,
  DestinationRepository,
  destinationSchema,
} from "@domain/destinations"
import {
  ConflictError,
  DestinationId,
  findPostgresUniqueViolationConstraint,
  type RepositoryError,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
} from "@domain/shared"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { decryptField, encryptField, getEncryptionKey } from "../encryption-key.ts"
import { organizations } from "../schema/better-auth.ts"
import { destinations } from "../schema/destinations.ts"

/**
 * Name of the unique index enforcing one destination per `(project_id, kind)`.
 * Must stay in sync with the index name declared in `schema/destinations.ts`.
 * Hardcoded as a string because Drizzle exposes the index identifier as a
 * runtime value, not a type-level constant.
 */
const PROJECT_KIND_UNIQUE_INDEX = "destinations_project_id_kind_idx"

/**
 * Conflict translation lives in a dedicated helper because `Effect.catchTag`
 * only narrows the typed return when the handler's return type is annotated
 * explicitly (mirrors `mapVendorAccountConflict` in slack-integration-repository).
 * Only the `(project_id, kind)` unique index maps to `ConflictError`; other
 * unique violations are rethrown as `RepositoryError`.
 */
const mapProjectKindConflict = (
  error: RepositoryError,
  destination: Destination,
): Effect.Effect<never, RepositoryError | ConflictError> => {
  const constraint = findPostgresUniqueViolationConstraint(error.cause)
  if (constraint === PROJECT_KIND_UNIQUE_INDEX) {
    return Effect.fail(new ConflictError({ entity: "Destination", field: "kind", value: destination.kind }))
  }
  return Effect.fail(error)
}

type DestinationRow = typeof destinations.$inferSelect

const toDomainDestination = (row: DestinationRow, encryptionKey: Buffer) =>
  Effect.gen(function* () {
    const credentialsJson = yield* decryptField(row.credentials, encryptionKey, "decryptDestinationCredentials")

    const destination: Destination = destinationSchema.parse({
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      kind: row.kind,
      name: row.name,
      config: row.config,
      credentials: JSON.parse(credentialsJson),
      status: row.status,
      consecutiveFailures: row.consecutiveFailures,
      lastFailureMessage: row.lastFailureMessage,
      cursorIngestedAt: row.cursorIngestedAt,
      cursorSpanId: row.cursorSpanId,
      lastRunAt: row.lastRunAt,
      consecutiveEmptyRuns: row.consecutiveEmptyRuns,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
    return destination
  })

const toInsertRow = (destination: Destination, organizationId: string, encryptionKey: Buffer) =>
  Effect.gen(function* () {
    const credentials = yield* encryptField(
      JSON.stringify(destination.credentials),
      encryptionKey,
      "encryptDestinationCredentials",
    )

    return {
      id: destination.id,
      organizationId,
      projectId: destination.projectId,
      kind: destination.kind,
      name: destination.name,
      config: destination.config,
      credentials,
      status: destination.status,
      consecutiveFailures: destination.consecutiveFailures,
      lastFailureMessage: destination.lastFailureMessage,
      cursorIngestedAt: destination.cursorIngestedAt,
      cursorSpanId: destination.cursorSpanId,
      lastRunAt: destination.lastRunAt,
      consecutiveEmptyRuns: destination.consecutiveEmptyRuns,
      createdByUserId: destination.createdByUserId,
      createdAt: destination.createdAt,
      updatedAt: destination.updatedAt,
    }
  })

export const DestinationRepositoryLive = Layer.effect(
  DestinationRepository,
  Effect.gen(function* () {
    const encryptionKey = yield* getEncryptionKey()

    return {
      save: (destination: Destination) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const row = yield* toInsertRow(destination, sqlClient.organizationId, encryptionKey)
          const { id: _id, organizationId: _organizationId, createdAt: _createdAt, ...updatable } = row

          yield* sqlClient
            .query((db) =>
              db
                .insert(destinations)
                .values(row)
                .onConflictDoUpdate({
                  target: destinations.id,
                  set: { ...updatable, updatedAt: new Date() },
                }),
            )
            .pipe(Effect.catchTag("RepositoryError", (error) => mapProjectKindConflict(error, destination)))
        }),

      listDue: (now: Date) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Cross-org sweep selection on the admin client — no org filter; the
          // organizations join excludes sandbox orgs (parent_org_id IS NOT NULL).
          const rows = yield* sqlClient
            .query((db) =>
              db
                .select({ destination: destinations })
                .from(destinations)
                .innerJoin(organizations, eq(organizations.id, destinations.organizationId))
                .where(
                  and(
                    eq(destinations.status, "active"),
                    isNull(organizations.parentOrgId),
                    or(
                      isNull(destinations.lastRunAt),
                      sql`${destinations.lastRunAt} + least((${destinations.config} ->> 'intervalMs')::double precision * power(2, ${destinations.consecutiveEmptyRuns}), ${DESTINATION_IDLE_BACKOFF_MAX_MS}::double precision) * interval '1 millisecond' <= ${now.toISOString()}::timestamptz`,
                    ),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "listDueDestinations")))

          return yield* Effect.forEach(rows, (row) => toDomainDestination(row.destination, encryptionKey))
        }),

      advanceCursor: ({ id, expected, next }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(destinations)
                .set({ cursorIngestedAt: next.ingestedAt, cursorSpanId: next.spanId, updatedAt: new Date() })
                .where(
                  and(
                    eq(destinations.id, id),
                    eq(destinations.organizationId, organizationId),
                    eq(destinations.cursorIngestedAt, expected.ingestedAt),
                    eq(destinations.cursorSpanId, expected.spanId),
                  ),
                )
                .returning({ id: destinations.id }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "advanceDestinationCursor")))

          return rows.length > 0
        }),

      deleteByProjectId: (projectId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .delete(destinations)
                .where(and(eq(destinations.projectId, projectId), eq(destinations.organizationId, organizationId)))
                .returning({ id: destinations.id }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "deleteDestinationsByProjectId")))

          return rows.map((row) => DestinationId(row.id))
        }),
    }
  }),
)
