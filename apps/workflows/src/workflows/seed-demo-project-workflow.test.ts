import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, mockActivities } = vi.hoisted(() => {
  const callOrder: string[] = []
  const mockActivities = {
    seedDemoProjectPostgresActivity: vi.fn(async () => {
      callOrder.push("postgres")
    }),
    seedDemoProjectClickHouseActivity: vi.fn(async () => {
      callOrder.push("clickhouse")
    }),
    seedDemoProjectWeaviateActivity: vi.fn(async () => {
      callOrder.push("weaviate")
    }),
  }
  return { callOrder, mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
}))

import { seedDemoProjectWorkflow } from "./seed-demo-project-workflow.ts"

const baseInput = {
  organizationId: "org-1",
  projectId: "proj-demo",
  queueAssigneeUserIds: ["user-1", "user-2"] as const,
  apiKeyId: "apikey-1",
  timelineAnchorIso: "2026-01-01T00:00:00.000Z",
}

describe("seedDemoProjectWorkflow", () => {
  beforeEach(() => {
    callOrder.length = 0
    vi.clearAllMocks()
  })

  it("runs Postgres → ClickHouse → Weaviate in dependency order", async () => {
    const result = await seedDemoProjectWorkflow(baseInput)

    expect(callOrder).toEqual(["postgres", "clickhouse", "weaviate"])
    expect(result).toEqual({ action: "seeded", projectId: "proj-demo" })
  })

  it("threads the same input through every activity", async () => {
    await seedDemoProjectWorkflow(baseInput)

    expect(mockActivities.seedDemoProjectPostgresActivity).toHaveBeenCalledWith(baseInput)
    expect(mockActivities.seedDemoProjectClickHouseActivity).toHaveBeenCalledWith(baseInput)
    expect(mockActivities.seedDemoProjectWeaviateActivity).toHaveBeenCalledWith(baseInput)
  })

  it("propagates failure from the Postgres activity and skips downstream activities", async () => {
    mockActivities.seedDemoProjectPostgresActivity.mockImplementationOnce(async () => {
      throw new Error("postgres seed failed")
    })

    await expect(seedDemoProjectWorkflow(baseInput)).rejects.toThrow("postgres seed failed")
    expect(mockActivities.seedDemoProjectClickHouseActivity).not.toHaveBeenCalled()
    expect(mockActivities.seedDemoProjectWeaviateActivity).not.toHaveBeenCalled()
  })
})
