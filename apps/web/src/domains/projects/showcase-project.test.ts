import { OrganizationId, ProjectId, SHOWCASE_PROJECT_SLUG } from "@domain/shared"
import { describe, expect, it, vi } from "vitest"
import type { ProjectRecord } from "./projects.functions.ts"
import { loadProjectRouteData, mergeShowcaseProject } from "./showcase-project.ts"

const makeProject = (over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: ProjectId("proj_1"),
  organizationId: OrganizationId("org_1"),
  name: "My project",
  slug: "my-project",
  settings: {
    keepMonitoring: undefined,
    notifications: undefined,
    escalation: undefined,
    onboardingType: undefined,
    onboardingCompleted: undefined,
    isSample: undefined,
    sampling: undefined,
    redaction: undefined,
  },
  firstTraceAt: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  isShowcase: false,
  ...over,
})

describe("mergeShowcaseProject", () => {
  it("appends the showcase row when one is resolved", () => {
    const projects = [makeProject({ id: ProjectId("proj_a") }), makeProject({ id: ProjectId("proj_b") })]
    const showcase = makeProject({ id: ProjectId("proj_demo"), slug: SHOWCASE_PROJECT_SLUG, isShowcase: true })

    const merged = mergeShowcaseProject(projects, showcase)

    expect(merged).toHaveLength(3)
    expect(merged.at(-1)).toBe(showcase)
    expect(merged.filter((p) => p.isShowcase)).toHaveLength(1)
  })

  it("returns a copy of the list without a showcase entry when none is resolved (absent or org opted out)", () => {
    const projects = [makeProject({ id: ProjectId("proj_a") })]

    const merged = mergeShowcaseProject(projects, null)

    expect(merged).toEqual(projects)
    expect(merged.some((p) => p.isShowcase)).toBe(false)
    expect(merged).not.toBe(projects)
  })
})

describe("loadProjectRouteData", () => {
  it("resolves the reserved showcase slug through the showcase resolver", async () => {
    const showcase = makeProject({ slug: SHOWCASE_PROJECT_SLUG, isShowcase: true })
    const loadShowcaseProject = vi.fn().mockResolvedValue(showcase)
    const loadProjectBySlug = vi.fn()

    const result = await loadProjectRouteData({
      slug: SHOWCASE_PROJECT_SLUG,
      loadShowcaseProject,
      loadProjectBySlug,
    })

    expect(result).toEqual({ project: showcase, isShowcase: true })
    expect(loadShowcaseProject).toHaveBeenCalledOnce()
    expect(loadProjectBySlug).not.toHaveBeenCalled()
  })

  it("throws for the reserved slug when the showcase is absent or the org opted out", async () => {
    const loadShowcaseProject = vi.fn().mockResolvedValue(null)

    await expect(
      loadProjectRouteData({
        slug: SHOWCASE_PROJECT_SLUG,
        loadShowcaseProject,
        loadProjectBySlug: vi.fn(),
      }),
    ).rejects.toThrow()
  })

  it("resolves a normal slug org-scoped and never touches the showcase resolver", async () => {
    const project = makeProject({ slug: "real-project" })
    const loadShowcaseProject = vi.fn()
    const loadProjectBySlug = vi.fn().mockResolvedValue(project)

    const result = await loadProjectRouteData({
      slug: "real-project",
      loadShowcaseProject,
      loadProjectBySlug,
    })

    expect(result).toEqual({ project, isShowcase: false })
    expect(loadProjectBySlug).toHaveBeenCalledWith("real-project")
    expect(loadShowcaseProject).not.toHaveBeenCalled()
  })
})
