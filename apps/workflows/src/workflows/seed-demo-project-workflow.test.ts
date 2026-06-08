import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, mockActivities, childExecutions, patchedState } = vi.hoisted(() => {
  const callOrder: string[] = []
  const patchedState = { enabled: true }
  const childExecutions: Array<{ readonly args: unknown[]; readonly workflowId: string }> = []
  const mockActivities = {
    seedDemoProjectPostgresActivity: vi.fn(async () => {
      callOrder.push("postgres")
    }),
    seedDemoProjectClickHouseActivity: vi.fn(async () => {
      callOrder.push("clickhouse")
    }),
    seedDemoProjectTraceSearchActivity: vi.fn(async () => {
      callOrder.push("trace-search")
    }),
  }
  return { callOrder, mockActivities, childExecutions, patchedState }
})

vi.mock("@temporalio/workflow", () => ({
  patched: () => patchedState.enabled,
  proxyActivities: () => mockActivities,
  executeChild: async (_workflow: unknown, options: { args: unknown[]; workflowId: string }) => {
    callOrder.push("taxonomy")
    childExecutions.push({ args: options.args, workflowId: options.workflowId })
    return { status: "completed" }
  },
}))

vi.mock("./taxonomy-gardening-workflow.ts", () => ({
  gardenTaxonomyWorkflow: async () => ({ status: "completed" }),
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
    childExecutions.length = 0
    patchedState.enabled = true
    vi.clearAllMocks()
  })

  it("runs Postgres → ClickHouse → trace search → taxonomy in dependency order", async () => {
    const result = await seedDemoProjectWorkflow(baseInput)

    expect(callOrder).toEqual(["postgres", "clickhouse", "trace-search", "taxonomy"])
    expect(result).toEqual({ action: "seeded", projectId: "proj-demo" })
  })

  it("threads the same input through every activity", async () => {
    await seedDemoProjectWorkflow(baseInput)

    expect(mockActivities.seedDemoProjectPostgresActivity).toHaveBeenCalledWith(baseInput)
    expect(mockActivities.seedDemoProjectClickHouseActivity).toHaveBeenCalledWith(baseInput)
    expect(mockActivities.seedDemoProjectTraceSearchActivity).toHaveBeenCalledWith(baseInput)
    expect(childExecutions).toEqual([
      {
        args: [{ organizationId: "org-1", projectId: "proj-demo", dimension: "topic", trigger: "manual" }],
        workflowId: "org:org-1:taxonomy:garden:proj-demo:seed",
      },
    ])
  })

  it("keeps replay compatibility for workflows started before derived data seeding", async () => {
    patchedState.enabled = false

    const result = await seedDemoProjectWorkflow(baseInput)

    expect(callOrder).toEqual(["postgres", "clickhouse"])
    expect(mockActivities.seedDemoProjectTraceSearchActivity).not.toHaveBeenCalled()
    expect(childExecutions).toEqual([])
    expect(result).toEqual({ action: "seeded", projectId: "proj-demo" })
  })

  it("propagates failure from the Postgres activity and skips downstream activities", async () => {
    mockActivities.seedDemoProjectPostgresActivity.mockImplementationOnce(async () => {
      throw new Error("postgres seed failed")
    })

    await expect(seedDemoProjectWorkflow(baseInput)).rejects.toThrow("postgres seed failed")
    expect(mockActivities.seedDemoProjectClickHouseActivity).not.toHaveBeenCalled()
    expect(mockActivities.seedDemoProjectTraceSearchActivity).not.toHaveBeenCalled()
    expect(childExecutions).toEqual([])
  })

  it("propagates failure from the ClickHouse activity and skips derived-data activities", async () => {
    mockActivities.seedDemoProjectClickHouseActivity.mockImplementationOnce(async () => {
      throw new Error("clickhouse seed failed")
    })

    await expect(seedDemoProjectWorkflow(baseInput)).rejects.toThrow("clickhouse seed failed")
    expect(mockActivities.seedDemoProjectTraceSearchActivity).not.toHaveBeenCalled()
    expect(childExecutions).toEqual([])
  })
})
