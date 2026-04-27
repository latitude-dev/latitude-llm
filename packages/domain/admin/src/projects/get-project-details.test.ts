import { NotFoundError, type ProjectId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { getProjectDetailsUseCase } from "./get-project-details.ts"
import type { AdminProjectDetails } from "./project-details.ts"
import { AdminProjectRepository } from "./project-repository.ts"

const TARGET = "proj-target" as ProjectId

const successfulRepo = (result: AdminProjectDetails) =>
  Layer.succeed(AdminProjectRepository, {
    findById: () => Effect.succeed(result),
  })

const missingRepo = () =>
  Layer.succeed(AdminProjectRepository, {
    findById: (id) => Effect.fail(new NotFoundError({ entity: "Project", id })),
  })

const mkDetails = (overrides: Partial<AdminProjectDetails> = {}): AdminProjectDetails => ({
  id: TARGET,
  name: "Test Project",
  slug: "test-project",
  organization: { id: "org-1", name: "Org One", slug: "org-one" },
  settings: null,
  firstTraceAt: null,
  lastEditedAt: new Date("2024-01-02"),
  deletedAt: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-02"),
  ...overrides,
})

describe("getProjectDetailsUseCase", () => {
  it("returns the project details from the repository", async () => {
    const details = mkDetails()
    const result = await Effect.runPromise(
      getProjectDetailsUseCase({ projectId: TARGET }).pipe(Effect.provide(successfulRepo(details))),
    )
    expect(result).toBe(details)
  })

  it("propagates NotFoundError verbatim when the project does not exist", async () => {
    await expect(
      Effect.runPromise(getProjectDetailsUseCase({ projectId: TARGET }).pipe(Effect.provide(missingRepo()))),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Project" })
  })
})
