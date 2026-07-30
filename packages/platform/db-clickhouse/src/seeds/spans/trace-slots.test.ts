import type { ClickHouseClient } from "@clickhouse/client"
import { createSeedScope, SEED_API_KEY_ID, SEED_ORG_ID, SEED_PROJECT_ID, seedTraceHex } from "@domain/shared/seeding"
import { costSourceSchema } from "@domain/spans"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
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

const scope = createSeedScope({
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
  timelineAnchor: new Date("2026-06-16T12:00:00.000Z"),
  apiKeyId: SEED_API_KEY_ID,
})

// Every demo seeder's rows, collected once: running them is the expensive part of
// this file, so the suites below share one pass.
const insertedSpans: Record<string, unknown>[] = []

beforeAll(async () => {
  for (const seeder of spanSeeders) {
    await Effect.runPromise(seeder.run({ client: recordingClient(insertedSpans), scope, quiet: true }))
  }
})

const num = (span: Record<string, unknown>, key: string): number => Number(span[key] ?? 0)

describe("spanTraceSlots", () => {
  it("regenerates exactly the trace ids the demo span seeders emit", () => {
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

/**
 * The `unpriced_span_count` rollups count `cost_source = 'unpriced'` straight from
 * the column, with none of `parseCostSource`'s fallback for rows written before it
 * existed. A seeded span that carries usage and no cost source is invisible to that
 * path, so seeds have to write what ingestion writes.
 *
 * Spans with neither tokens nor cost may still omit it: they reclassify to
 * `no_tokens` on the way out, and nothing reads the column raw for that state.
 */
describe("seeded cost_source", () => {
  const carriesUsage = (span: Record<string, unknown>): boolean =>
    num(span, "cost_total_microcents") > 0 || num(span, "tokens_input") + num(span, "tokens_output") > 0

  it("declares a real cost source on every span carrying usage", () => {
    const withUsage = insertedSpans.filter(carriesUsage)
    const invalid = withUsage.filter((span) => !costSourceSchema.safeParse(span.cost_source).success)

    expect(withUsage.length).toBeGreaterThan(0)
    expect(invalid.map((span) => `${span.name}: ${JSON.stringify(span.cost_source)}`)).toEqual([])
  })

  it("agrees with cost_is_estimated wherever a span carries cost", () => {
    const withCost = insertedSpans.filter((span) => num(span, "cost_total_microcents") > 0)

    expect(withCost.length).toBeGreaterThan(0)
    for (const span of withCost) {
      expect(span.cost_source).toBe(num(span, "cost_is_estimated") === 1 ? "estimated" : "provider_reported")
    }
  })

  it("seeds both sides of the provenance split", () => {
    const sources = new Set(insertedSpans.filter(carriesUsage).map((span) => span.cost_source))

    expect(sources).toContain("estimated")
    expect(sources).toContain("provider_reported")
  })
})
