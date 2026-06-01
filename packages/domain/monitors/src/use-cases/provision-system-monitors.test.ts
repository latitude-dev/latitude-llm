import { type Monitor, MonitorRepository, type MonitorRepositoryShape } from "@domain/monitors"
import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { provisionSystemMonitorsUseCase } from "./provision-system-monitors.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const buildRepo = () => {
  const calls: (readonly Monitor[])[] = []
  const repo: MonitorRepositoryShape = {
    findById: () => Effect.die("findById not used"),
    findBySlug: () => Effect.die("findBySlug not used"),
    list: () => Effect.die("list not used"),
    // Echo the input — the use-case's job is to build the right entities; the
    // idempotency/skip logic is the repository's and is tested against PGlite.
    provisionSystemMonitors: (monitors) => {
      calls.push(monitors)
      return Effect.succeed(monitors)
    },
  }
  return { repo, calls }
}

const run = (repo: MonitorRepositoryShape) =>
  Effect.runPromise(
    provisionSystemMonitorsUseCase({ organizationId, projectId }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
        ),
      ),
    ),
  )

describe("provisionSystemMonitorsUseCase", () => {
  it("builds the three system monitors with org/project scoping, unmuted and system=true", async () => {
    const { repo, calls } = buildRepo()
    const result = await run(repo)

    expect(calls.length).toBe(1)
    expect(result.map((m) => m.slug)).toEqual(["issue-discovered", "issue-regressed", "issue-escalating"])
    for (const monitor of result) {
      expect(monitor.system).toBe(true)
      expect(monitor.organizationId).toBe(organizationId)
      expect(monitor.projectId).toBe(projectId)
      expect(monitor.mutedAt).toBeNull()
      expect(monitor.deletedAt).toBeNull()
      expect(monitor.alerts.length).toBe(1)
      expect(monitor.alerts[0]?.monitorId).toBe(monitor.id)
      expect(monitor.alerts[0]?.source).toEqual({ type: "issue", id: null })
    }
  })

  it("derives alert severity from kind and provisions the escalating sensitivity default", async () => {
    const { repo } = buildRepo()
    const result = await run(repo)

    const bySlug = new Map(result.map((m) => [m.slug, m]))
    expect(bySlug.get("issue-discovered")?.alerts[0]).toMatchObject({
      kind: "issue.new",
      severity: "medium",
      condition: null,
    })
    expect(bySlug.get("issue-regressed")?.alerts[0]).toMatchObject({
      kind: "issue.regressed",
      severity: "high",
      condition: null,
    })
    expect(bySlug.get("issue-escalating")?.alerts[0]).toMatchObject({
      kind: "issue.escalating",
      severity: "high",
      condition: { kind: "issue.escalating", sensitivity: 3 },
    })
  })
})
