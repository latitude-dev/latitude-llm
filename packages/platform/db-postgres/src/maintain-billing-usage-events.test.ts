import { type BillingUsageEvent, BillingUsageEventRepository } from "@domain/billing"
import { OrganizationId, ProjectId, type SqlClient, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  ensureBillingUsageEventsPartitions,
  maintainBillingUsageEventsRetention,
} from "./maintain-billing-usage-events.ts"
import { BillingUsageEventRepositoryLive } from "./repositories/billing-usage-event-repository.ts"
import { setupTestPostgres } from "./test/in-memory-postgres.ts"
import { withPostgres } from "./with-postgres.ts"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, BillingUsageEventRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(BillingUsageEventRepositoryLive, pg.adminPostgresClient, ORGANIZATION_ID)))

const utcMonthStart = (offsetMonths: number): Date => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1))
}

const partitionNameFor = (offsetMonths: number): string => {
  const monthStart = utcMonthStart(offsetMonths)
  return `billing_usage_events_${monthStart.getUTCFullYear()}_${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`
}

const listPartitionNames = async (): Promise<string[]> => {
  const result = await pg.client.query<{ partition_name: string }>(`
    SELECT child_class.relname AS partition_name
    FROM pg_inherits
    JOIN pg_class parent_class ON pg_inherits.inhparent = parent_class.oid
    JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent_class.relnamespace
    JOIN pg_class child_class ON pg_inherits.inhrelid = child_class.oid
    WHERE parent_namespace.nspname = 'latitude'
      AND parent_class.relname = 'billing_usage_events'
      AND child_class.relname ~ '^billing_usage_events_[0-9]{4}_[0-9]{2}$'
    ORDER BY child_class.relname
  `)
  return result.rows.map((row) => row.partition_name)
}

const dropPartition = async (offsetMonths: number): Promise<void> => {
  await pg.client.exec(`DROP TABLE IF EXISTS latitude.${partitionNameFor(offsetMonths)}`)
}

const makeEvent = (offsetMonths: number): BillingUsageEvent => ({
  id: "e".repeat(24),
  organizationId: ORGANIZATION_ID,
  projectId: PROJECT_ID,
  action: "trace",
  credits: 1,
  idempotencyKey: `trace:partition-test:${offsetMonths}`,
  traceId: TraceId("t".repeat(32)),
  metadata: undefined,
  happenedAt: new Date(),
  billingPeriodStart: utcMonthStart(offsetMonths),
  billingPeriodEnd: utcMonthStart(offsetMonths + 1),
})

const insertForPeriod = (offsetMonths: number) =>
  runWithLive(
    Effect.gen(function* () {
      const repo = yield* BillingUsageEventRepository
      return yield* repo.insertIfAbsent(makeEvent(offsetMonths))
    }),
  )

const insertManyForPeriod = (offsetMonths: number) =>
  runWithLive(
    Effect.gen(function* () {
      const repo = yield* BillingUsageEventRepository
      return yield* repo.insertMany([
        {
          ...makeEvent(offsetMonths),
          id: "f".repeat(24),
          idempotencyKey: `trace:partition-batch:${offsetMonths}`,
        },
      ])
    }),
  )

describe("billing usage event partition maintenance", () => {
  it("recreates a dropped current-month partition so inserts succeed again", async () => {
    await dropPartition(0)

    expect(await listPartitionNames()).not.toContain(partitionNameFor(0))
    await expect(insertForPeriod(0)).rejects.toThrow(/no partition of relation/)

    await ensureBillingUsageEventsPartitions(pg.adminPostgresClient)

    expect(await listPartitionNames()).toContain(partitionNameFor(0))
    expect(await insertForPeriod(0)).toBe(true)
  })

  it("recreates the current-month partition for insertMany (recordTraceUsageBatch path)", async () => {
    await dropPartition(0)

    await expect(insertManyForPeriod(0)).rejects.toThrow(/no partition of relation/)

    await ensureBillingUsageEventsPartitions(pg.adminPostgresClient)

    expect(await insertManyForPeriod(0)).toBe(1)
  })

  it("creates a month outside the migrated window when monthsAhead is raised", async () => {
    expect(await listPartitionNames()).not.toContain(partitionNameFor(4))
    await expect(insertForPeriod(4)).rejects.toThrow(/no partition of relation/)

    await ensureBillingUsageEventsPartitions(pg.adminPostgresClient, { monthsAhead: 4 })

    expect(await listPartitionNames()).toContain(partitionNameFor(4))
    expect(await insertForPeriod(4)).toBe(true)
  })

  it("is idempotent and keeps the current plus default-ahead months", async () => {
    await maintainBillingUsageEventsRetention(pg.adminPostgresClient)
    await maintainBillingUsageEventsRetention(pg.adminPostgresClient)

    const names = await listPartitionNames()
    expect(names).toContain(partitionNameFor(0))
    expect(names).toContain(partitionNameFor(3))
  })
})
