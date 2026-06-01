import { MonitorRepository, provisionSystemMonitorsUseCase } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorRepositoryShape } from "../ports/monitor-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

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
    const { repo, monitors } = createFakeMonitorRepository()
    const result = await run(repo)

    expect(result.map((m) => m.slug)).toEqual(["issue-discovered", "issue-regressed", "issue-escalating"])
    expect(monitors.length).toBe(3)
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
    const { repo } = createFakeMonitorRepository()
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

  it("is idempotent — re-provisioning an already-seeded project inserts nothing", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    await run(repo)
    const secondRun = await run(repo)

    expect(secondRun).toEqual([])
    expect(monitors.length).toBe(3)
  })
})
