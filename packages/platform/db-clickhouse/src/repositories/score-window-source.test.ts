import { ScoreProjectSweepSource, ScoreWindowSource } from "@domain/agent-score"
import { FLAGGER_NO_REFLAG_TAG } from "@domain/flaggers"
import { type ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { ScoreProjectSweepSourceLive, ScoreWindowSourceLive } from "./score-window-source.ts"

const organizationId = OrganizationId("o".repeat(24))
const otherOrganizationId = OrganizationId("x".repeat(24))
const projectId = ProjectId("p".repeat(24))
const otherProjectId = ProjectId("q".repeat(24))
const to = new Date("2026-09-29T00:00:00.000Z")
const STEP_DAYS = [7, 14, 21, 28]
const ch = setupTestClickHouse()

const layers = Layer.mergeAll(ScoreWindowSourceLive, ScoreProjectSweepSourceLive)

const run = <A, E>(effect: Effect.Effect<A, E, ScoreWindowSource | ScoreProjectSweepSource | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(layers, ch.client, organizationId)))

/** Sessions are timestamped by how many days before the cutoff they last did anything. */
const chDate = (daysBeforeCutoff: number, hoursIntoDay = 1) =>
  new Date(to.getTime() - daysBeforeCutoff * 86_400_000 + hoursIntoDay * 3_600_000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "")

/** A timestamp close enough to the cutoff that the session-end debounce has not elapsed. */
const settledMinutesBeforeCutoff = (minutes: number) =>
  `${new Date(to.getTime() - minutes * 60_000).toISOString().replace("T", " ").replace("Z", "")}000000`

const sessionRow = (
  sessionId: string,
  daysBeforeCutoff: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  organization_id: organizationId as string,
  project_id: projectId as string,
  session_id: sessionId,
  min_start_time: `${chDate(daysBeforeCutoff)}000000`,
  max_start_time: `${chDate(daysBeforeCutoff)}000000`,
  max_end_time: `${chDate(daysBeforeCutoff)}000000`,
  tokens_total: 1,
  ...overrides,
})

const counts = () =>
  run(
    Effect.gen(function* () {
      const source = yield* ScoreWindowSource
      return yield* source.readEligibleCounts({ organizationId, projectId, to, stepDays: STEP_DAYS })
    }),
  )

const sessionIds = (fromDaysBeforeCutoff: number) =>
  run(
    Effect.gen(function* () {
      const source = yield* ScoreWindowSource
      return yield* source.readEligibleSessionIds({
        organizationId,
        projectId,
        from: new Date(to.getTime() - fromDaysBeforeCutoff * 86_400_000),
        to,
      })
    }),
  )

describe("ScoreWindowSourceLive", () => {
  it("counts every candidate step from one read, nesting shorter steps inside longer ones", async () => {
    await ch.client.insert({
      table: "sessions",
      values: [
        sessionRow("recent-1", 1),
        sessionRow("recent-2", 3),
        sessionRow("second-week", 9),
        sessionRow("third-week", 17),
        sessionRow("fourth-week", 25),
        sessionRow("too-old", 40),
      ],
      format: "JSONEachRow",
    })

    expect(await counts()).toEqual([
      { stepDays: 7, eligibleSessions: 2 },
      { stepDays: 14, eligibleSessions: 3 },
      { stepDays: 21, eligibleSessions: 4 },
      { stepDays: 28, eligibleSessions: 5 },
    ])
  })

  it("excludes untokened sessions, no-reflag traffic, and sessions still inside the debounce", async () => {
    await ch.client.insert({
      table: "sessions",
      values: [
        sessionRow("counted", 2),
        sessionRow("no-llm-activity", 2, { tokens_total: 0 }),
        sessionRow("no-reflag", 2, { tags: [FLAGGER_NO_REFLAG_TAG] }),
        // Two minutes before the cutoff, so the five-minute session-end debounce has not elapsed.
        sessionRow("still-running", 0, {
          min_start_time: settledMinutesBeforeCutoff(2),
          max_start_time: settledMinutesBeforeCutoff(2),
          max_end_time: settledMinutesBeforeCutoff(2),
        }),
      ],
      format: "JSONEachRow",
    })

    expect((await counts())[0]).toEqual({ stepDays: 7, eligibleSessions: 1 })
  })

  it("excludes simulation traffic, which is not production behaviour", async () => {
    await ch.client.insert({ table: "sessions", values: [sessionRow("production", 2)], format: "JSONEachRow" })
    // `simulation_id` is an aggregate-function column, so it cannot be written through JSONEachRow.
    await ch.client.command({
      query: `
        INSERT INTO sessions (organization_id, project_id, session_id, min_start_time, max_start_time, max_end_time, tokens_total, simulation_id)
        SELECT
          '${organizationId}', '${projectId}', 'simulated',
          toDateTime64('${chDate(2)}', 9, 'UTC'),
          toDateTime64('${chDate(2)}', 9, 'UTC'),
          toDateTime64('${chDate(2)}', 9, 'UTC'),
          1,
          argMaxIfState(toFixedString('simulation-000000000001', 24), toDateTime64('${chDate(2)}', 9, 'UTC'), toUInt8(1))
      `,
    })

    expect((await counts())[0]).toEqual({ stepDays: 7, eligibleSessions: 1 })
  })

  it("scopes counts to the organization and the project", async () => {
    await ch.client.insert({
      table: "sessions",
      values: [
        sessionRow("mine", 2),
        sessionRow("other-project", 2, { project_id: otherProjectId as string }),
        sessionRow("other-org", 2, { organization_id: otherOrganizationId as string }),
      ],
      format: "JSONEachRow",
    })

    expect((await counts())[0]).toEqual({ stepDays: 7, eligibleSessions: 1 })
  })

  it("returns the chosen step's session ids and nothing older", async () => {
    await ch.client.insert({
      table: "sessions",
      values: [sessionRow("in-window", 3), sessionRow("outside-window", 20)],
      format: "JSONEachRow",
    })

    expect(await sessionIds(7)).toEqual(["in-window"])
    expect([...(await sessionIds(28))].sort()).toEqual(["in-window", "outside-window"])
  })

  it("asks for nothing when no step was requested", async () => {
    const result = await run(
      Effect.gen(function* () {
        const source = yield* ScoreWindowSource
        return yield* source.readEligibleCounts({ organizationId, projectId, to, stepDays: [] })
      }),
    )

    expect(result).toEqual([])
  })
})

describe("ScoreProjectSweepSourceLive", () => {
  it("returns every project above the floor across organizations, with its count", async () => {
    await ch.client.insert({
      table: "sessions",
      values: [
        ...Array.from({ length: 3 }, (_, index) => sessionRow(`mine-${index}`, 2)),
        ...Array.from({ length: 2 }, (_, index) =>
          sessionRow(`theirs-${index}`, 2, {
            organization_id: otherOrganizationId as string,
            project_id: otherProjectId as string,
          }),
        ),
      ],
      format: "JSONEachRow",
    })

    const projects = await run(
      Effect.gen(function* () {
        const source = yield* ScoreProjectSweepSource
        return yield* source.listProjects({ to, maxStepDays: 28, sessionFloor: 2 })
      }),
    )

    expect(projects).toEqual([
      { organizationId, projectId, eligibleSessions: 3 },
      { organizationId: otherOrganizationId, projectId: otherProjectId, eligibleSessions: 2 },
    ])
  })

  it("still finds a long session that started before the window but stayed active inside it", async () => {
    // Started 40 days out, last active 2 days out: outside the 28-day window by start time, inside
    // it by activity, and the grace margin on the partition bound is what keeps it visible.
    await ch.client.insert({
      table: "sessions",
      values: [sessionRow("long-running", 2, { min_start_time: `${chDate(40)}000000` }), sessionRow("ordinary", 2)],
      format: "JSONEachRow",
    })

    const projects = await run(
      Effect.gen(function* () {
        const source = yield* ScoreProjectSweepSource
        return yield* source.listProjects({ to, maxStepDays: 28, sessionFloor: 2 })
      }),
    )

    expect(projects).toEqual([{ organizationId, projectId, eligibleSessions: 2 }])
  })

  it("does not fan out to a project whose traffic is all older than the window", async () => {
    await ch.client.insert({
      table: "sessions",
      values: Array.from({ length: 5 }, (_, index) => sessionRow(`ancient-${index}`, 200)),
      format: "JSONEachRow",
    })

    const projects = await run(
      Effect.gen(function* () {
        const source = yield* ScoreProjectSweepSource
        return yield* source.listProjects({ to, maxStepDays: 28, sessionFloor: 1 })
      }),
    )

    expect(projects).toEqual([])
  })

  it("leaves out a project that cannot publish under any step", async () => {
    await ch.client.insert({
      table: "sessions",
      values: [
        ...Array.from({ length: 5 }, (_, index) => sessionRow(`busy-${index}`, 2)),
        sessionRow("quiet", 2, { project_id: otherProjectId as string }),
      ],
      format: "JSONEachRow",
    })

    const projects = await run(
      Effect.gen(function* () {
        const source = yield* ScoreProjectSweepSource
        return yield* source.listProjects({ to, maxStepDays: 28, sessionFloor: 5 })
      }),
    )

    expect(projects).toEqual([{ organizationId, projectId, eligibleSessions: 5 }])
  })
})
