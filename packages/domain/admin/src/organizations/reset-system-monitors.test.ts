import { buildSystemMonitors, MonitorRepository } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AdminOrganizationDetails } from "./organization-details.ts"
import { AdminOrganizationRepository } from "./organization-repository.ts"
import { resetSystemMonitorsUseCase } from "./reset-system-monitors.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectA = "a".repeat(24)
const projectB = "b".repeat(24)
const at = new Date("2026-06-01T10:00:00.000Z")

const makeOrg = (projectIds: readonly string[]): AdminOrganizationDetails => ({
  id: organizationId,
  name: "Acme",
  slug: "acme",
  stripeCustomerId: null,
  members: [],
  projects: projectIds.map((id) => ({ id, name: `Project ${id}`, slug: id, createdAt: at })),
  createdAt: at,
  updatedAt: at,
})

const fakeAdminRepo = (org: AdminOrganizationDetails) =>
  AdminOrganizationRepository.of({
    findById: () => Effect.succeed(org),
    findManySummariesByIds: () => Effect.die("findManySummariesByIds not used"),
    findFirstApiKeyId: () => Effect.die("findFirstApiKeyId not used"),
  })

const run = (org: AdminOrganizationDetails, monitorRepo: ReturnType<typeof createFakeMonitorRepository>["repo"]) =>
  Effect.runPromise(
    resetSystemMonitorsUseCase({ organizationId }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(AdminOrganizationRepository, fakeAdminRepo(org)),
          Layer.succeed(MonitorRepository, MonitorRepository.of(monitorRepo)),
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
        ),
      ),
    ),
  )

describe("resetSystemMonitorsUseCase", () => {
  it("re-provisions the three system monitors for every project in the org", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    const result = await run(makeOrg([projectA, projectB]), repo)

    expect(result).toEqual({ projectsCount: 2, monitorsReset: 6 })
    expect(monitors.length).toBe(6)
    for (const projectId of [projectA, projectB]) {
      const slugs = monitors
        .filter((m) => m.projectId === projectId)
        .map((m) => m.slug)
        .sort()
      expect(slugs).toEqual(["issue-discovered", "issue-escalating", "issue-regressed"])
    }
  })

  it("overwrites an existing system monitor's metadata (not skip-if-exists)", async () => {
    const seeded = buildSystemMonitors({ organizationId, projectId: ProjectId(projectA) }).map((monitor) =>
      monitor.slug === "issue-discovered" ? { ...monitor, name: "Stale name", description: "Stale" } : monitor,
    )
    const { repo, monitors } = createFakeMonitorRepository(seeded)

    const result = await run(makeOrg([projectA]), repo)

    expect(result).toEqual({ projectsCount: 1, monitorsReset: 3 })
    expect(monitors.length).toBe(3)
    const discovered = monitors.find((m) => m.projectId === projectA && m.slug === "issue-discovered")
    expect(discovered?.name).toBe("Issue discovered")
    expect(discovered?.description).toBe("Notifies each time a new issue is detected.")
  })
})
