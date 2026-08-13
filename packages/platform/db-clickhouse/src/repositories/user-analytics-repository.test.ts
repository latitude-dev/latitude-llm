import type { ChSqlClient } from "@domain/shared"
import { ExternalUserId, OrganizationId, ProjectId } from "@domain/shared"
import { UserAnalyticsRepository, type UserAnalyticsRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { UserAnalyticsRepositoryLive } from "./user-analytics-repository.ts"

const ORG_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))

const USER_A = ExternalUserId("user-a")
const USER_B = ExternalUserId("user-b")
const USER_C = ExternalUserId("user-c")

const DAY_MS = 24 * 60 * 60 * 1000
// Fixed anchor so bucketing assertions are deterministic.
const NOW = new Date("2026-06-10T12:00:00.000Z")
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS)

function toClickHouseDateTime(value: Date): string {
  return value.toISOString().replace("T", " ").replace("Z", "")
}

function makeSpan({
  traceId,
  spanId,
  userId,
  userEmail = "",
  sessionId = "",
  startTime,
  statusCode = 0,
  model = "",
  toolName = "",
  operation = "chat",
  costTotalMicrocents = 0,
  tokensTotal = 0,
}: {
  readonly traceId: string
  readonly spanId?: string
  readonly userId: string
  readonly userEmail?: string
  readonly sessionId?: string
  readonly startTime: Date
  readonly statusCode?: number
  readonly model?: string
  readonly toolName?: string
  readonly operation?: string
  readonly costTotalMicrocents?: number
  readonly tokensTotal?: number
}) {
  return {
    organization_id: ORG_ID as string,
    project_id: PROJECT_ID as string,
    session_id: sessionId,
    user_id: userId,
    user_email: userEmail,
    trace_id: traceId,
    span_id: spanId ?? traceId.slice(0, 16),
    parent_span_id: "",
    api_key_id: "test-api-key",
    simulation_id: "",
    start_time: toClickHouseDateTime(startTime),
    end_time: toClickHouseDateTime(new Date(startTime.getTime() + 1_000)),
    name: "user-analytics-test-span",
    service_name: "user-analytics-test",
    kind: 0,
    status_code: statusCode,
    status_message: "",
    error_type: "",
    tags: [],
    metadata: {},
    operation,
    provider: model ? "openai" : "",
    model,
    response_model: "",
    tokens_input: tokensTotal,
    tokens_output: 0,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: costTotalMicrocents,
    cost_total_microcents: costTotalMicrocents,
    cost_is_estimated: 0,
    time_to_first_token_ns: 0,
    is_streaming: 0,
    response_id: "",
    finish_reasons: [],
    input_messages: "",
    output_messages: "",
    system_instructions: "",
    tool_definitions: "",
    tool_call_id: "",
    tool_name: toolName,
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: {},
    scope_name: "",
    scope_version: "",
  }
}

const traceId = (suffix: string): string => suffix.repeat(32).slice(0, 32)

const SPANS = [
  // user-a: 3 traces across 2 sessions, one errored, first seen 10 days ago.
  makeSpan({
    traceId: traceId("a1"),
    userId: USER_A,
    userEmail: "a@example.com",
    sessionId: "session-a1",
    startTime: daysAgo(10),
    model: "gpt-4o",
    costTotalMicrocents: 100,
    tokensTotal: 10,
  }),
  makeSpan({
    traceId: traceId("a2"),
    userId: USER_A,
    sessionId: "session-a1",
    startTime: daysAgo(2),
    model: "gpt-4o",
    costTotalMicrocents: 200,
    tokensTotal: 20,
  }),
  // Same trace as a2: the tool call that the LLM step invoked. Tool spans carry
  // no usage (excluded from the cost/token rollup), but feed the tool breakdown.
  makeSpan({
    traceId: traceId("a2"),
    spanId: "a2toolaaaaaaaaaa",
    userId: USER_A,
    sessionId: "session-a1",
    startTime: daysAgo(2),
    toolName: "search",
    operation: "execute_tool",
  }),
  makeSpan({
    traceId: traceId("a3"),
    userId: USER_A,
    sessionId: "session-a2",
    startTime: daysAgo(1),
    statusCode: 2,
    model: "gpt-4o-mini",
    costTotalMicrocents: 300,
    tokensTotal: 30,
  }),
  // user-b: 1 trace, no email, 5 days ago.
  makeSpan({
    traceId: traceId("b1"),
    userId: USER_B,
    sessionId: "session-b1",
    startTime: daysAgo(5),
    costTotalMicrocents: 50,
    tokensTotal: 5,
  }),
  // user-c: first seen yesterday (a "new user" for recent ranges).
  makeSpan({
    traceId: traceId("c1"),
    userId: USER_C,
    userEmail: "c@example.com",
    startTime: daysAgo(1),
    costTotalMicrocents: 10,
    tokensTotal: 1,
  }),
  // Anonymous trace — must never surface as a user.
  makeSpan({
    traceId: traceId("d1"),
    userId: "",
    startTime: daysAgo(1),
  }),
]

const ch = setupTestClickHouse({ truncateBetweenTests: false })

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

describe("UserAnalyticsRepository", () => {
  let repo: UserAnalyticsRepositoryShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* UserAnalyticsRepository
      }).pipe(withClickHouse(UserAnalyticsRepositoryLive, ch.client, ORG_ID)),
    )
  })

  // Every test only reads, so the fixture is seeded once for the file.
  beforeAll(async () => {
    await Effect.runPromise(insertJsonEachRow(ch.client, "spans", SPANS))
  })

  describe("listByProjectId", () => {
    it("aggregates one row per identified user ordered by last seen", async () => {
      const page = await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID }))

      expect(page.totalCount).toBe(3)
      expect(page.hasMore).toBe(false)
      expect(page.items.map((item) => item.userId)).toEqual([USER_A, USER_C, USER_B])

      const userA = page.items[0]
      expect(userA?.userEmail).toBe("a@example.com")
      expect(userA?.traceCount).toBe(3)
      expect(userA?.sessionCount).toBe(2)
      expect(userA?.errorSessionCount).toBe(1)
      expect(userA?.costTotalMicrocents).toBe(600)
      expect(userA?.costAvgMicrocents).toBe(200)
      expect(userA?.costMedianMicrocents).toBe(200)
      expect(userA?.tokensTotal).toBe(60)
      expect(userA?.firstSeenAt.getTime()).toBe(daysAgo(10).getTime())
      expect(userA?.lastSeenAt.getTime()).toBe(daysAgo(1).getTime())

      // Column-level rollup across all users: sum of totals (600 + 50 + 10),
      // mean of per-user averages (200, 50, 10), median of per-user medians.
      expect(page.costRollup.sum).toBe(660)
      expect(page.costRollup.avg).toBeCloseTo((200 + 50 + 10) / 3, 5)
      expect(page.costRollup.median).toBe(50)
    })

    it("sorts by cost and paginates", async () => {
      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { sortBy: "cost", sortDirection: "desc", limit: 2, offset: 0 },
        }),
      )

      expect(page.items.map((item) => item.userId)).toEqual([USER_A, USER_B])
      expect(page.hasMore).toBe(true)
      expect(page.totalCount).toBe(3)
    })

    it("matches user id and email case-insensitively in search", async () => {
      const byEmail = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: "A@EXAMPLE" },
        }),
      )
      expect(byEmail.items.map((item) => item.userId)).toEqual([USER_A])

      // user-a carries the email on only 1 of 3 traces; matching by email must
      // still aggregate over all of them.
      const userA = byEmail.items[0]
      expect(userA?.traceCount).toBe(3)
      expect(userA?.sessionCount).toBe(2)
      expect(userA?.costTotalMicrocents).toBe(600)
      expect(userA?.firstSeenAt.getTime()).toBe(daysAgo(10).getTime())
      expect(byEmail.totalCount).toBe(1)
      expect(byEmail.costRollup.sum).toBe(600)

      const byId = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: "user-b" },
        }),
      )
      expect(byId.items.map((item) => item.userId)).toEqual([USER_B])
    })

    it("treats LIKE wildcards in the search input as literals", async () => {
      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: "ex_mple" },
        }),
      )
      expect(page.items).toEqual([])
    })

    it("scopes metrics to the requested time range", async () => {
      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { timeRange: { from: daysAgo(3), to: NOW } },
        }),
      )

      const userA = page.items.find((item) => item.userId === USER_A)
      expect(userA?.traceCount).toBe(2)
      expect(page.items.some((item) => item.userId === USER_B)).toBe(false)
    })
  })

  describe("activityByUserIds", () => {
    it("returns per-user daily buckets, empty series for inactive users", async () => {
      const series = await runCh(
        repo.activityByUserIds({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          userIds: [USER_A, USER_B],
          timeRange: { from: daysAgo(3), to: NOW },
          bucketSeconds: 24 * 60 * 60,
        }),
      )

      expect(series).toHaveLength(2)
      const userA = series.find((entry) => entry.userId === USER_A)
      expect(userA?.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(2)
      expect(userA?.buckets.reduce((sum, bucket) => sum + bucket.errorCount, 0)).toBe(1)
      const userB = series.find((entry) => entry.userId === USER_B)
      expect(userB?.buckets).toEqual([])
    })

    it("counts only errored traces when errorsOnly is set", async () => {
      const series = await runCh(
        repo.activityByUserIds({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          userIds: [USER_A],
          timeRange: { from: daysAgo(3), to: NOW },
          bucketSeconds: 24 * 60 * 60,
          errorsOnly: true,
        }),
      )

      const userA = series.find((entry) => entry.userId === USER_A)
      expect(userA?.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(1)
      expect(userA?.buckets.reduce((sum, bucket) => sum + bucket.errorCount, 0)).toBe(1)
    })
  })

  describe("getOverviewByProjectId", () => {
    it("computes unique/new users and trace identification for the range", async () => {
      const overview = await runCh(
        repo.getOverviewByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          timeRange: { from: daysAgo(3), to: NOW },
          bucketSeconds: 24 * 60 * 60,
        }),
      )

      expect(overview.uniqueUsers).toBe(2) // user-a, user-c
      expect(overview.newUsers).toBe(1) // only user-c's first trace falls in range
      expect(overview.identifiedTraces).toBe(3)
      expect(overview.totalTraces).toBe(4) // + anonymous trace
      // In range: session-a1 (a2, ok), session-a2 (a3, error), user-c's session, anon d1's session.
      expect(overview.identifiedSessions).toBe(3) // user-attributed sessions
      expect(overview.totalSessions).toBe(4) // + the anonymous session
      expect(overview.histogram.length).toBeGreaterThan(0)
      expect(overview.histogram.reduce((sum, bucket) => sum + bucket.traceCount, 0)).toBe(3)
      // Histogram is user-attributed: 3 identified sessions, one of them errored (session-a2).
      expect(overview.histogram.reduce((sum, bucket) => sum + bucket.sessionCount, 0)).toBe(3)
      expect(overview.histogram.reduce((sum, bucket) => sum + bucket.errorSessionCount, 0)).toBe(1)
    })
  })

  describe("findByUserId", () => {
    it("returns the lifetime profile", async () => {
      const profile = await runCh(repo.findByUserId({ organizationId: ORG_ID, projectId: PROJECT_ID, userId: USER_A }))

      expect(profile.userEmail).toBe("a@example.com")
      expect(profile.traceCount).toBe(3)
      expect(profile.sessionCount).toBe(2)
      expect(profile.errorSessionCount).toBe(1)
      expect(profile.activeDays).toBe(3)
      expect(profile.avgDurationNs).toBeGreaterThan(0)
    })

    it("restricts the profile to errored traces when errorsOnly is set", async () => {
      const profile = await runCh(
        repo.findByUserId({ organizationId: ORG_ID, projectId: PROJECT_ID, userId: USER_A, errorsOnly: true }),
      )

      expect(profile.traceCount).toBe(1)
      expect(profile.sessionCount).toBe(1)
      expect(profile.errorSessionCount).toBe(1)
    })

    it("fails with NotFoundError for unknown users", async () => {
      const result = await runCh(
        repo
          .findByUserId({ organizationId: ORG_ID, projectId: PROJECT_ID, userId: ExternalUserId("nobody") })
          .pipe(Effect.flip),
      )
      expect(result._tag).toBe("NotFoundError")
    })
  })

  describe("usageBreakdownByUserId", () => {
    it("counts distinct traces per model", async () => {
      const slices = await runCh(
        repo.usageBreakdownByUserId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          userId: USER_A,
          dimension: "model",
        }),
      )

      expect(slices).toEqual([
        { value: "gpt-4o", traceCount: 2 },
        { value: "gpt-4o-mini", traceCount: 1 },
      ])
    })

    it("counts tool usage", async () => {
      const slices = await runCh(
        repo.usageBreakdownByUserId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          userId: USER_A,
          dimension: "tool",
        }),
      )

      expect(slices).toEqual([{ value: "search", traceCount: 1 }])
    })

    it("restricts the breakdown to errored traces when errorsOnly is set", async () => {
      const slices = await runCh(
        repo.usageBreakdownByUserId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          userId: USER_A,
          dimension: "model",
          errorsOnly: true,
        }),
      )

      expect(slices).toEqual([{ value: "gpt-4o-mini", traceCount: 1 }])
    })
  })
})
