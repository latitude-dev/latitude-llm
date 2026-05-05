import { type BillingUsageEvent, BillingUsageEventRepository, UsageEventAlreadyRecordedError } from "@domain/billing"
import {
  causesIncludePostgresUniqueViolation,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SqlClient,
  type SqlClientShape,
  TraceId,
} from "@domain/shared"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { billingUsageEvents } from "../schema/billing.ts"

const mapBillingEventIdempotencyViolation = (
  error: RepositoryError,
  idempotencyKey: string,
): Effect.Effect<never, UsageEventAlreadyRecordedError | RepositoryError> =>
  causesIncludePostgresUniqueViolation(error.cause)
    ? Effect.fail(new UsageEventAlreadyRecordedError({ idempotencyKey }))
    : Effect.fail(error)

const toDomain = (row: typeof billingUsageEvents.$inferSelect): BillingUsageEvent => ({
  id: row.id,
  organizationId: OrganizationId(row.organizationId),
  projectId: ProjectId(row.projectId),
  action: row.action as BillingUsageEvent["action"],
  credits: row.credits,
  idempotencyKey: row.idempotencyKey,
  traceId: row.traceId ? TraceId(row.traceId) : undefined,
  metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
  happenedAt: row.happenedAt,
  billingPeriodStart: row.billingPeriodStart,
  billingPeriodEnd: row.billingPeriodEnd,
})

export const BillingUsageEventRepositoryLive = Layer.effect(
  BillingUsageEventRepository,
  Effect.gen(function* () {
    return {
      insert: (event: BillingUsageEvent) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db) =>
              db.insert(billingUsageEvents).values({
                id: event.id,
                organizationId: event.organizationId,
                projectId: event.projectId,
                action: event.action,
                credits: event.credits,
                idempotencyKey: event.idempotencyKey,
                traceId: event.traceId ?? null,
                metadata: event.metadata ? JSON.stringify(event.metadata) : null,
                happenedAt: event.happenedAt,
                billingPeriodStart: event.billingPeriodStart,
                billingPeriodEnd: event.billingPeriodEnd,
              }),
            )
            .pipe(
              Effect.catchTag("RepositoryError", (repositoryError) =>
                mapBillingEventIdempotencyViolation(repositoryError, event.idempotencyKey),
              ),
            )
        }),

      findByKey: (key: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [result] = yield* sqlClient.query((db) =>
            db.select().from(billingUsageEvents).where(eq(billingUsageEvents.idempotencyKey, key)).limit(1),
          )
          return result ? toDomain(result) : null
        }),
    }
  }),
)
