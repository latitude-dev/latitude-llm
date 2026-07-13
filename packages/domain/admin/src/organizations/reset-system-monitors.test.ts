import { MonitorRepository } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { MonitorId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
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
  wantsShowcase: false,
  members: [],
  projects: projectIds.map((id) => ({ id, name: `Project ${id}`, slug: id, createdAt: at })),
  sandboxes: [],
  createdAt: at,
  updatedAt: at,
})

const fakeAdminRepo = (org: AdminOrganizationDetails) =>
  AdminOrganizationRepository.of({
    findById: () => Effect.succeed(org),
    findManySummariesByIds: () => Effect.die("findManySummariesByIds not used"),
    findFirstApiKeyId: () => Effect.die("findFirstApiKeyId not used"),
    setWantsShowcase: () => Effect.die("setWantsShowcase not used"),
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
  it("keeps the compatibility command as a no-op after system monitors are deleted", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    const result = await run(makeOrg([projectA, projectB]), repo)

    expect(result).toEqual({ projectsCount: 2, monitorsReset: 0 })
    expect(monitors.length).toBe(0)
  })

  it("does not overwrite existing monitors", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    monitors.push({
      id: MonitorId("m".repeat(24)),
      organizationId,
      projectId: ProjectId(projectA),
      slug: "custom-monitor",
      name: "Custom monitor",
      description: "Custom",
      target: {
        type: "session",
        id: null,
        kind: "session",
        stream: "traces",
        query: null,
        savedSearchId: null,
        metric: { kind: "count" },
      },
      rule: { trigger: "match", config: {}, severity: "medium" },
      mutedAt: null,
      deletedAt: null,
      system: false,
      createdAt: at,
      updatedAt: at,
    })

    const result = await run(makeOrg([projectA]), repo)

    expect(result).toEqual({ projectsCount: 1, monitorsReset: 0 })
    expect(monitors).toHaveLength(1)
    expect(monitors[0]?.slug).toBe("custom-monitor")
  })
})
