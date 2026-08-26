import { type Monitor, MonitorRepository } from "@domain/monitors"
import { MonitorId, OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
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
  lastEvaluatedAt: null,
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
})

describe("MonitorRepositoryLive evaluation watermark", () => {
  beforeEach(async () => {
    await pg.db.delete(monitors)
  })

  const target: Monitor["target"] = {
    type: "user",
    id: null,
    kind: "user",
    stream: "traces",
    query: null,
    savedSearchId: null,
    metric: { kind: "count" },
  }

  it("round-trips the watermark without touching updatedAt", async () => {
    const id = "mon-watermark"
    const evaluatedAt = new Date("2026-06-01T11:30:00.000Z")
    await create(makeMonitor(id, target))

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* MonitorRepository
        yield* repo.setLastEvaluatedAt({ id: MonitorId(id.padEnd(24, "x").slice(0, 24)), lastEvaluatedAt: evaluatedAt })
      }),
    )

    const stored = await findById(id)
    expect(stored.lastEvaluatedAt).toEqual(evaluatedAt)
    expect(stored.updatedAt).toEqual(at)
  })

  it("does not fail when the monitor is gone", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* MonitorRepository
          yield* repo.setLastEvaluatedAt({ id: MonitorId("mon-missing".padEnd(24, "x")), lastEvaluatedAt: at })
        }),
      ),
    ).resolves.toBeUndefined()
  })
})
