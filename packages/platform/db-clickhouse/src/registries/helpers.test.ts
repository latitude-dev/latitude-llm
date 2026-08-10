import type { FilterCondition } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { buildCacheHitRateClause, buildSessionMembershipClause, dateTime64BestEffortExpression } from "./helpers.ts"

describe("buildCacheHitRateClause", () => {
  it("builds a divide-by-zero-guarded HAVING ratio for gte, treating the value as a percentage", () => {
    const cond: FilterCondition = { op: "gte", value: 80 }
    const { clause, params } = buildCacheHitRateClause(cond, "f_0")
    expect(clause).toBe(
      "((tokens_input + tokens_cache_read + tokens_cache_create) > 0 AND " +
        "(tokens_cache_read / (tokens_input + tokens_cache_read + tokens_cache_create)) >= {f_0:Float64} / 100)",
    )
    expect(params).toEqual({ f_0: 80 })
  })

  it("supports lte for finding broken-cache (low-rate) rows", () => {
    const { clause, params } = buildCacheHitRateClause({ op: "lte", value: 50 }, "f_1")
    expect(clause).toContain(") <= {f_1:Float64} / 100)")
    expect(params).toEqual({ f_1: 50 })
  })

  it("rejects non-comparison operators", () => {
    expect(() => buildCacheHitRateClause({ op: "contains", value: "x" }, "f_0")).toThrow(
      /Unsupported cacheHitRate filter operator/,
    )
  })
})

describe("dateTime64BestEffortExpression", () => {
  const registry = {
    startTime: {
      column: "start_time",
      chType: "DateTime64(9, 'UTC')",
      valueExpression: dateTime64BestEffortExpression,
    },
  } as const

  it("compiles scalar comparisons through parseDateTime64BestEffort with String params", () => {
    const value = "2026-06-09T22:41:43.054269123-05:00"
    const { clauses, params } = buildClickHouseWhere({ startTime: [{ op: "gte", value }] }, registry)

    expect(clauses).toEqual(["start_time >= parseDateTime64BestEffort({f_0:String}, 9, 'UTC')"])
    expect(params).toEqual({ f_0: value })
  })

  it("compiles in arrays through parseDateTime64BestEffort without rewriting values", () => {
    const values = ["2026-06-09T22:41:43.054269123Z", "2026-06-10T05:11:12.987654321+05:30"]
    const { clauses, params } = buildClickHouseWhere({ startTime: [{ op: "in", value: values }] }, registry)

    expect(clauses).toEqual([
      "has(arrayMap(x -> parseDateTime64BestEffort(x, 9, 'UTC'), {f_0:Array(String)}), start_time)",
    ])
    expect(params).toEqual({ f_0: values })
  })

  it("compiles notIn arrays through parseDateTime64BestEffort without rewriting values", () => {
    const values = ["2026-06-09T22:41:43.054269123-07:00"]
    const { clauses, params } = buildClickHouseWhere({ startTime: [{ op: "notIn", value: values }] }, registry)

    expect(clauses).toEqual([
      "NOT has(arrayMap(x -> parseDateTime64BestEffort(x, 9, 'UTC'), {f_0:Array(String)}), start_time)",
    ])
    expect(params).toEqual({ f_0: values })
  })
})

describe("dateTime64BestEffortExpression with chdb", () => {
  const ch = setupTestClickHouse()
  const registry = {
    startTime: {
      column: "parseDateTime64BestEffort({candidate:String}, 9, 'UTC')",
      chType: "DateTime64(9, 'UTC')",
      valueExpression: dateTime64BestEffortExpression,
    },
  } as const

  async function scalarMatch(op: FilterCondition["op"], value: FilterCondition["value"], candidate = UTC_INSTANT) {
    const { clauses, params } = buildClickHouseWhere({ startTime: [{ op, value }] }, registry)
    const result = await ch.client.query({
      query: `SELECT ${clauses[0]} AS matched`,
      query_params: { ...params, candidate },
      format: "JSONEachRow",
    })
    const rows = await result.json<{ matched: boolean | number }>()
    return rows[0]?.matched === true || rows[0]?.matched === 1
  }

  const UTC_INSTANT = "2026-06-10T03:41:43.054269123Z"

  it.each([
    ["Z", "2026-06-10T03:41:43.054269123Z"],
    ["+00:00", "2026-06-10T03:41:43.054269123+00:00"],
    ["negative offset", "2026-06-09T22:41:43.054269123-05:00"],
    ["positive offset", "2026-06-10T09:11:43.054269123+05:30"],
    ["negative offset without colon", "2026-06-09T22:41:43.054269123-0500"],
    ["positive offset without colon", "2026-06-10T09:11:43.054269123+0530"],
    ["bare timestamp", "2026-06-10T03:41:43.054269123"],
  ])("parses %s as the same UTC DateTime64(9) instant", async (_label, value) => {
    await expect(scalarMatch("eq", value)).resolves.toBe(true)
  })

  it("executes scalar comparisons at nanosecond precision", async () => {
    await expect(scalarMatch("gt", "2026-06-10T03:41:43.054269122Z")).resolves.toBe(true)
    await expect(scalarMatch("lt", "2026-06-10T03:41:43.054269124Z")).resolves.toBe(true)
    await expect(scalarMatch("gte", UTC_INSTANT)).resolves.toBe(true)
    await expect(scalarMatch("lte", UTC_INSTANT)).resolves.toBe(true)
  })

  it("executes in and notIn arrays through generated array expressions", async () => {
    const sameInstantValues = ["2026-06-09T22:41:43.054269123-05:00", "2026-06-10T09:11:43.054269123+05:30"]

    await expect(scalarMatch("in", sameInstantValues)).resolves.toBe(true)
    await expect(scalarMatch("notIn", sameInstantValues)).resolves.toBe(false)
    await expect(scalarMatch("notIn", ["2026-06-10T03:41:43.054269124Z"])).resolves.toBe(true)
  })

  it("keeps original values parameterized when building filters", () => {
    const values = ["2026-06-09T22:41:43.054269123-05:00", "2026-06-10T09:11:43.054269123+05:30"]
    const { clauses, params } = buildClickHouseWhere({ startTime: [{ op: "in", value: values }] }, registry)

    expect(clauses.join(" ")).not.toContain(values[0])
    expect(clauses.join(" ")).not.toContain(values[1])
    expect(params).toEqual({ f_0: values })
  })

  it("fails invalid timestamp input at execution", async () => {
    await expect(scalarMatch("eq", "not-a-timestamp")).rejects.toThrow()
  })
})

describe("cacheHitRate via buildClickHouseWhere", () => {
  const registry = {
    cacheHitRate: { kind: "synthetic", buildClause: buildCacheHitRateClause },
  } as const

  it("compiles a min/max range into two guarded clauses with Float64 params", () => {
    const { clauses, params } = buildClickHouseWhere(
      {
        cacheHitRate: [
          { op: "gte", value: 80 },
          { op: "lte", value: 95 },
        ],
      },
      registry,
    )
    expect(clauses).toHaveLength(2)
    expect(clauses[0]).toContain(">= {f_0:Float64} / 100")
    expect(clauses[1]).toContain("<= {f_1:Float64} / 100")
    expect(params).toEqual({ f_0: 80, f_1: 95 })
  })
})

/**
 * Executed rather than string-compared, because the orphan arm compares a `FixedString(32)` trace id
 * — as an id in the exact form and through `toString` in the fragment form — and whether ClickHouse
 * accepts that is the whole question.
 */
describe("sessionId membership via buildClickHouseWhere", () => {
  const ch = setupTestClickHouse()
  const registry = {
    sessionId: { kind: "synthetic", buildClause: buildSessionMembershipClause },
  } as const

  const CONVERSATION_TRACE_ID = "aaaa0000000000000000000000000001"
  const ORPHAN_TRACE_ID = "bbbb0000000000000000000000000002"

  async function matches(
    op: FilterCondition["op"],
    value: FilterCondition["value"],
    row: { readonly sessionId: string; readonly traceId: string },
  ) {
    const { clauses, params } = buildClickHouseWhere({ sessionId: [{ op, value }] }, registry)
    const result = await ch.client.query({
      query: `SELECT ${clauses[0]} AS matched
              FROM (SELECT {rowSessionId:String} AS session_id, toFixedString({rowTraceId:String}, 32) AS trace_id)`,
      query_params: { ...params, rowSessionId: row.sessionId, rowTraceId: row.traceId },
      format: "JSONEachRow",
    })
    const rows = await result.json<{ matched: boolean | number }>()
    return rows[0]?.matched === true || rows[0]?.matched === 1
  }

  const conversationRow = { sessionId: "sess-checkout-42", traceId: CONVERSATION_TRACE_ID }
  const orphanRow = { sessionId: "", traceId: ORPHAN_TRACE_ID }

  describe("a whole id", () => {
    it("matches a trace by its session id", async () => {
      await expect(matches("eq", "sess-checkout-42", conversationRow)).resolves.toBe(true)
      await expect(matches("eq", "sess-checkout-42", orphanRow)).resolves.toBe(false)
    })

    it("matches a sessionless trace by its own trace id", async () => {
      await expect(matches("eq", ORPHAN_TRACE_ID, orphanRow)).resolves.toBe(true)
      await expect(matches("eq", ORPHAN_TRACE_ID, conversationRow)).resolves.toBe(false)
    })

    it("matches any of several ids", async () => {
      await expect(matches("in", ["sess-other", ORPHAN_TRACE_ID], orphanRow)).resolves.toBe(true)
      await expect(matches("in", ["sess-other", "sess-another"], conversationRow)).resolves.toBe(false)
    })

    it("negates membership rather than comparing the column", async () => {
      await expect(matches("neq", "sess-checkout-42", conversationRow)).resolves.toBe(false)
      await expect(matches("neq", "sess-checkout-42", orphanRow)).resolves.toBe(true)
      await expect(matches("notIn", [ORPHAN_TRACE_ID], orphanRow)).resolves.toBe(false)
    })
  })

  // What the filter box actually sends: every text field debounces into `contains`, so this is the
  // operator a user reaches by typing into "Session ID" — it used to throw, which died as an
  // unhandled defect rather than a rejected filter.
  describe("a fragment of an id", () => {
    it("matches a session id containing it", async () => {
      await expect(matches("contains", "checkout", conversationRow)).resolves.toBe(true)
      await expect(matches("contains", "refund", conversationRow)).resolves.toBe(false)
    })

    it("matches a sessionless trace whose trace id contains it", async () => {
      await expect(matches("contains", "bbbb", orphanRow)).resolves.toBe(true)
      await expect(matches("contains", "aaaa", orphanRow)).resolves.toBe(false)
    })

    it("ignores case, as ILIKE does everywhere else", async () => {
      await expect(matches("contains", "CHECKOUT", conversationRow)).resolves.toBe(true)
      await expect(matches("contains", "BBBB", orphanRow)).resolves.toBe(true)
    })

    it("negates a fragment match", async () => {
      await expect(matches("notContains", "checkout", conversationRow)).resolves.toBe(false)
      await expect(matches("notContains", "checkout", orphanRow)).resolves.toBe(true)
    })
  })

  describe("nothing to match", () => {
    it("matches no row for an empty id, and every row for its negation", async () => {
      await expect(matches("eq", "", conversationRow)).resolves.toBe(false)
      await expect(matches("neq", "", conversationRow)).resolves.toBe(true)
    })

    it("rejects an ordering comparison on an opaque id", () => {
      expect(() => buildSessionMembershipClause({ op: "gt", value: "sess-1" }, "f_0")).toThrow(
        /Unsupported sessionId filter operator/,
      )
    })
  })
})
