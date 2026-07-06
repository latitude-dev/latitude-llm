import type { ClickHouseClient } from "@clickhouse/client"
import { createSeedScope, SEED_API_KEY_ID, SEED_ORG_ID, SEED_PROJECT_ID, seedTraceHex } from "@domain/shared/seeding"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { spanSeeders, spanTraceSlots } from "./index.ts"

// Records inserted span rows and reports every sentinel check as "not seeded"
// so each seeder runs its full body once.
const recordingClient = (insertedSpans: Record<string, unknown>[]): ClickHouseClient =>
  ({
    query: async () => ({ json: async () => [{ present: "0" }] }),
    insert: async ({ table, values }: { table: string; values: ReadonlyArray<Record<string, unknown>> }) => {
      if (table === "spans") insertedSpans.push(...values)
    },
  }) as unknown as ClickHouseClient

describe("spanTraceSlots", () => {
  it("regenerates exactly the trace ids the demo span seeders emit", async () => {
    const insertedSpans: Record<string, unknown>[] = []
    const scope = createSeedScope({
      organizationId: SEED_ORG_ID,
      projectId: SEED_PROJECT_ID,
      timelineAnchor: new Date("2026-06-16T12:00:00.000Z"),
      apiKeyId: SEED_API_KEY_ID,
    })

    for (const seeder of spanSeeders) {
      await Effect.runPromise(seeder.run({ client: recordingClient(insertedSpans), scope, quiet: true }))
    }

    const seededTraceIds = new Set(insertedSpans.map((span) => span.trace_id as string))
    const slotTraceIds = new Set(spanTraceSlots.map((slot) => seedTraceHex(scope.projectId, slot.traceKey, slot.index)))

    expect(seededTraceIds.size).toBeGreaterThan(0)
    expect([...slotTraceIds].sort()).toEqual([...seededTraceIds].sort())
  })

  it("has no duplicate slots", () => {
    const keys = spanTraceSlots.map((slot) => `${slot.traceKey}:${slot.index}`)
    expect(new Set(keys).size).toEqual(keys.length)
  })
})
