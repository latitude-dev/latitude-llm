import { type BillingUsageEvent, BillingUsageEventRepository } from "@domain/billing"
import { OrganizationId, ProjectId, SqlClient, type SqlClientShape, TraceId } from "@domain/shared"
import { desc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { billingUsageEvents } from "../schema/billing.ts"

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

const toInsertRow = (event: BillingUsageEvent): typeof billingUsageEvents.$inferInsert => ({
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
})

const uniqueByPeriodAndIdempotencyKey = (events: readonly BillingUsageEvent[]): readonly BillingUsageEvent[] => {
  const eventsByKey = new Map<string, BillingUsageEvent>()

  for (const event of events) {
    const key = `${event.billingPeriodStart.toISOString()}:${event.idempotencyKey}`
    if (!eventsByKey.has(key)) {
      eventsByKey.set(key, event)
    }
  }

  return [...eventsByKey.values()]
}

export const BillingUsageEventRepositoryLive = Layer.succeed(BillingUsageEventRepository, {
  insertIfAbsent: Effect.fn("dbPostgres.billingUsageEvent.insertIfAbsent")(function* (event: BillingUsageEvent) {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    const inserted = yield* sqlClient.query((db) =>
      db
        .insert(billingUsageEvents)
        .values(toInsertRow(event))
        .onConflictDoNothing({ target: [billingUsageEvents.billingPeriodStart, billingUsageEvents.idempotencyKey] })
        .returning({ id: billingUsageEvents.id }),
    )

    return inserted.length === 1
  }),
  insertMany: Effect.fn("dbPostgres.billingUsageEvent.insertMany")(function* (events: readonly BillingUsageEvent[]) {
    if (events.length === 0) return 0

    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    const inserted = yield* sqlClient.query((db) =>
      db
        .insert(billingUsageEvents)
        .values(uniqueByPeriodAndIdempotencyKey(events).map(toInsertRow))
        .onConflictDoNothing({ target: [billingUsageEvents.billingPeriodStart, billingUsageEvents.idempotencyKey] })
        .returning({ id: billingUsageEvents.id }),
    )

    return inserted.length
  }),
  findOptionalByKey: Effect.fn("dbPostgres.billingUsageEvent.findOptionalByKey")(function* (key: string) {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
    const [result] = yield* sqlClient.query((db) =>
      db
        .select()
        .from(billingUsageEvents)
        .where(eq(billingUsageEvents.idempotencyKey, key))
        .orderBy(desc(billingUsageEvents.happenedAt))
        .limit(1),
    )

    return result ? toDomain(result) : null
  }),
})
