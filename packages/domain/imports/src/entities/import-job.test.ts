import { generateId, OrganizationId, ProjectId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { createImportJob, importJobSchema } from "./import-job.ts"

describe("import job", () => {
  it("creates a valid job in the pre-flight state, not one the worker can pick up", () => {
    const job = createImportJob({
      organizationId: OrganizationId(generateId()),
      projectId: ProjectId(generateId()),
      source: "langfuse",
      config: {
        sourceProjectId: "proj-1",
        sourceProjectName: "Demo",
        sourceRegion: "eu",
        sourceBaseUrl: "https://cloud.langfuse.com",
        rangeFrom: new Date("2026-01-01"),
        rangeTo: new Date("2026-04-01"),
        maxTraces: 1000,
        sourcePageSize: 1_000,
      },
      credentials: {
        kind: "langfuse",
        region: "eu",
        publicKey: "pk-test",
        secretKey: "sk-test",
      },
    })

    expect(job.status).toBe("created")
    expect(importJobSchema.safeParse(job).success).toBe(true)
  })
})
