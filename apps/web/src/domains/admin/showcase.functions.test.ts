import { OrganizationId, ProjectId } from "@domain/shared"
import { createShowcase } from "@domain/showcase"
import { describe, expect, it } from "vitest"
import { toShowcaseDto } from "./showcase.functions.ts"

describe("toShowcaseDto", () => {
  it("maps a freshly-created (empty) pointer with null project ids", () => {
    const showcase = createShowcase({
      organizationId: OrganizationId("showcaseorg000000000001x"),
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    })

    expect(toShowcaseDto(showcase)).toEqual({
      organizationId: "showcaseorg000000000001x",
      currentProjectId: null,
      nextProjectId: null,
      nextState: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    })
  })

  it("maps an in-flight build (current + next set, building)", () => {
    const showcase = createShowcase({
      organizationId: OrganizationId("showcaseorg000000000001x"),
      currentProjectId: ProjectId("showcasecurrent000000001"),
      nextProjectId: ProjectId("showcasenext00000000001x"),
      nextState: "building",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-08T04:00:00.000Z"),
    })

    expect(toShowcaseDto(showcase)).toMatchObject({
      currentProjectId: "showcasecurrent000000001",
      nextProjectId: "showcasenext00000000001x",
      nextState: "building",
      updatedAt: "2026-07-08T04:00:00.000Z",
    })
  })
})
