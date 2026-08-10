import { generateId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { IMPORT_STATUSES } from "../entities/import-job.ts"
import {
  importHarness,
  STUB_IMPORT_ORGANIZATION_ID,
  STUB_IMPORT_PROJECT_ID,
  stubImportJob,
} from "../testing/harness.ts"
import { deleteProjectImportsUseCase } from "./delete-project-imports.ts"

const deleteImports = (projectId = STUB_IMPORT_PROJECT_ID) =>
  deleteProjectImportsUseCase({ organizationId: STUB_IMPORT_ORGANIZATION_ID, projectId })

describe("deleteProjectImportsUseCase", () => {
  it("removes every import for the deleted project and reports the count", async () => {
    const h = importHarness({
      seed: [stubImportJob({ status: "running" }), stubImportJob({ status: "succeeded" })],
    })

    const result = await Effect.runPromise(deleteImports().pipe(Effect.provide(h.layer)))

    expect(result).toEqual({ deleted: 2 })
    expect(h.stored.size).toBe(0)
  })

  // An in-flight import for a deleted project would keep paging its source and writing
  // spans nobody can see, so no state is exempt.
  it.each(IMPORT_STATUSES.map((status) => [status]))("deletes a %s import", async (status) => {
    const h = importHarness({ seed: [stubImportJob({ status })] })

    const result = await Effect.runPromise(deleteImports().pipe(Effect.provide(h.layer)))

    expect(result).toEqual({ deleted: 1 })
    expect(h.stored.size).toBe(0)
  })

  it("leaves another project's imports alone", async () => {
    const other = stubImportJob({ projectId: ProjectId(generateId()), status: "running" })
    const h = importHarness({ seed: [other] })

    const result = await Effect.runPromise(deleteImports().pipe(Effect.provide(h.layer)))

    expect(result).toEqual({ deleted: 0 })
    expect(h.stored.get(other.id)).toBeDefined()
  })

  it("counts only the project it was asked for", async () => {
    const other = stubImportJob({ projectId: ProjectId(generateId()) })
    const h = importHarness({ seed: [stubImportJob(), stubImportJob({ status: "succeeded" }), other] })

    const result = await Effect.runPromise(deleteImports().pipe(Effect.provide(h.layer)))

    expect(result).toEqual({ deleted: 2 })
    expect([...h.stored.keys()]).toEqual([other.id])
  })

  it("is a no-op for a project with no imports", async () => {
    const h = importHarness()

    const result = await Effect.runPromise(deleteImports().pipe(Effect.provide(h.layer)))

    expect(result).toEqual({ deleted: 0 })
  })

  it("emits no event — the ProjectDeleted cascade is the event", async () => {
    const h = importHarness({ seed: [stubImportJob({ status: "running" })] })

    await Effect.runPromise(deleteImports().pipe(Effect.provide(h.layer)))

    expect(h.written).toEqual([])
  })
})
