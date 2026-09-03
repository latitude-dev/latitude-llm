import { type Monitor, MonitorRepository } from "@domain/monitors"
import { AlertIncidentId, MonitorId, OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { incidents } from "../schema/alert-incidents.ts"
import { monitors } from "../schema/monitors.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { MonitorRepositoryLive } from "./monitor-repository.ts"

const ORG_ID = OrganizationId("org-monitor-repo-test".padEnd(24, "x").slice(0, 24))
const PROJECT_ID = ProjectId("proj-monitor-repo-tes".padEnd(24, "x").slice(0, 24))
const at = new Date("2026-06-01T10:00:00.000Z")

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, MonitorRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(MonitorRepositoryLive, pg.adminPostgresClient, ORG_ID)))

const makeMonitor = (id: string, target: Monitor["target"], rule?: Monitor["rule"]): Monitor => ({
  id: MonitorId(id.padEnd(24, "x").slice(0, 24)),
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  slug: `slug-${id}`,
  name: `Monitor ${id}`,
  description: "",
  system: false,
  target,
  rule: rule ?? { trigger: "match", config: {}, severity: "low" },
  mutedAt: null,
  deletedAt: null,
  createdAt: at,
  updatedAt: at,
})

const create = (monitor: Monitor) =>
  runWithLive(
    Effect.gen(function* () {
      const repo = yield* MonitorRepository
      yield* repo.create(monitor)
    }),
  )

const findById = (id: string) =>
  runWithLive(
    Effect.gen(function* () {
      const repo = yield* MonitorRepository
      return yield* repo.findById(MonitorId(id.padEnd(24, "x").slice(0, 24)))
    }),
  )

describe("MonitorRepositoryLive target round-trip", () => {
  beforeEach(async () => {
    await pg.db.delete(monitors)
  })

  it("recomputes stream from target type on load (tool -> spans)", async () => {
    await create(
      makeMonitor("tool", {
        type: "tool",
        id: null,
        kind: "tool",
        // Deliberately wrong: stream is not persisted and must be recomputed from the target type.
        stream: "traces",
        query: null,
        savedSearchId: null,
        metric: { kind: "count" },
      }),
    )

    const loaded = await findById("tool")
    expect(loaded.target.type).toBe("tool")
    expect(loaded.target.kind).toBe("tool")
    expect(loaded.target.stream).toBe("spans")
  })

  it("recomputes stream from target type on load (session -> sessions)", async () => {
    await create(
      makeMonitor("session", {
        type: "session",
        id: null,
        kind: "session",
        stream: "traces",
        query: null,
        savedSearchId: null,
        metric: { kind: "count" },
      }),
    )

    const loaded = await findById("session")
    expect(loaded.target.stream).toBe("sessions")
  })

  it("reconstructs savedSearchId and traces stream for savedSearch targets", async () => {
    const savedSearchId = "ss".repeat(12)
    await create(
      makeMonitor("saved", {
        type: "savedSearch",
        id: savedSearchId,
        kind: "savedSearch",
        stream: "traces",
        query: null,
        savedSearchId,
        metric: { kind: "count" },
      }),
    )

    const loaded = await findById("saved")
    expect(loaded.target.stream).toBe("traces")
    expect(loaded.target.savedSearchId).toBe(savedSearchId)
  })

  it("reconstructs target.metric from config instead of defaulting to count", async () => {
    await create(
      makeMonitor(
        "metric",
        {
          type: "tool",
          id: null,
          kind: "tool",
          stream: "spans",
          query: null,
          savedSearchId: null,
          metric: { kind: "sum", field: "cost" },
        },
        { trigger: "match", config: { metric: { kind: "sum", field: "cost" } }, severity: "low" },
      ),
    )

    const loaded = await findById("metric")
    expect(loaded.target.metric).toEqual({ kind: "sum", field: "cost" })
  })

  it("persists a predicate that only the target carries, so an API-created monitor keeps its filters", async () => {
    const filterSet = { userId: [{ op: "eq" as const, value: "user-1" }] }
    await create(
      makeMonitor(
        "target-only-filters",
        {
          type: "user",
          id: null,
          filterSet,
          kind: "user",
          stream: "traces",
          query: null,
          savedSearchId: null,
          metric: { kind: "count" },
        },
        // The public API builds its rule config from metric/condition alone; the predicate
        // arrives on the target, and evaluating without it would watch the whole project.
        { trigger: "match", config: { metric: { kind: "count" } }, severity: "low" },
      ),
    )

    const loaded = await findById("target-only-filters")
    expect(loaded.target.filterSet).toEqual(filterSet)
    expect(loaded.rule.config.filterSet).toEqual(filterSet)
  })
})

describe("MonitorRepositoryLive list ordering", () => {
  beforeEach(async () => {
    await pg.db.delete(incidents)
    await pg.db.delete(monitors)
  })

  const insertIncident = async (monitorId: string, startedAt: Date, createdAt: Date) => {
    await pg.db.insert(incidents).values({
      id: AlertIncidentId(`inc-${monitorId}`.padEnd(24, "x").slice(0, 24)),
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      sourceType: "monitor",
      sourceId: MonitorId(monitorId.padEnd(24, "x").slice(0, 24)),
      severity: "medium",
      startedAt,
      endedAt: startedAt,
      createdAt,
    })
  }

  // The page is cut server-side, so a monitor that just fired has to rank high here — the client
  // comparator only reorders what this query already returned.
  it("ranks monitors by when their last incident was raised, not by its backdated start", async () => {
    const userTarget: Monitor["target"] = {
      type: "user",
      id: null,
      kind: "user",
      stream: "traces",
      query: null,
      savedSearchId: null,
      metric: { kind: "count" },
    }
    await create(makeMonitor("backdated", userTarget))
    await create(makeMonitor("older", userTarget))
    // Fired a minute ago for a run that began long before it.
    await insertIncident("backdated", new Date("2026-06-01T08:00:00.000Z"), new Date("2026-06-01T11:59:00.000Z"))
    // Fired an hour earlier, pointing at a more recent instant.
    await insertIncident("older", new Date("2026-06-01T10:30:00.000Z"), new Date("2026-06-01T10:30:00.000Z"))

    const page = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* MonitorRepository
        return yield* repo.list({ projectId: PROJECT_ID, limit: 10, offset: 0 })
      }),
    )

    expect(page.items.map((monitor) => monitor.slug)).toEqual(["slug-backdated", "slug-older"])
  })
})
