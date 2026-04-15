import { describe, expect, it } from "vitest"
import { generateId, isValidId, type OrganizationId, type ProjectId, type UserId } from "./id.ts"

describe("generateId", () => {
  it("returns a CUID2 string without a type argument", () => {
    const id = generateId()
    expect(typeof id).toBe("string")
    expect(isValidId(id)).toBe(true)
  })

  it("returns a CUID2 string with a brand type argument", () => {
    const id = generateId<"ProjectId">()
    expect(typeof id).toBe("string")
    expect(isValidId(id)).toBe(true)
  })
})

/** Compile-time checks: wrong brand must not be assignable across entity IDs. */
function _brandedGenerateIdTypeNarrowing(): void {
  const projectId: ProjectId = generateId<"ProjectId">()
  const userId: UserId = generateId<"UserId">()
  void projectId
  void userId

  // @ts-expect-error ProjectId must not satisfy OrganizationId
  const _wrongBrand: OrganizationId = generateId<"ProjectId">()

  // @ts-expect-error plain string is not a branded ProjectId
  const _plainNotBranded: ProjectId = generateId()
}

void _brandedGenerateIdTypeNarrowing
