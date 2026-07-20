import { ProjectId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { SHOWCASE_RETIRE_GRACE_MS, selectRetirableShowcaseProjectIds } from "./retirement.ts"

const NOW = new Date("2026-07-07T12:00:00.000Z")
const CURRENT = ProjectId("currentproject0000000001")
const NEXT = ProjectId("nextproject0000000000001")
const OLD = ProjectId("oldproject00000000000001")
const OTHER = ProjectId("otherproject000000000001")

// A createdAt comfortably past the grace window so age never masks the
// current/next filter under test.
const old = (id: ProjectId) => ({ id, createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000) })

describe("selectRetirableShowcaseProjectIds", () => {
  it("retires the swapped-out old project but never the live current or the in-flight next", () => {
    const retirable = selectRetirableShowcaseProjectIds({
      projects: [old(CURRENT), old(NEXT), old(OLD), old(OTHER)],
      currentProjectId: CURRENT,
      nextProjectId: NEXT,
      now: NOW,
    })

    expect(retirable).toEqual([OLD, OTHER])
  })

  it("keeps current when there is no in-flight next (post-swap idle pointer)", () => {
    const retirable = selectRetirableShowcaseProjectIds({
      projects: [old(CURRENT), old(OLD)],
      currentProjectId: CURRENT,
      nextProjectId: null,
      now: NOW,
    })

    expect(retirable).toEqual([OLD])
  })

  it("does not retire a project younger than the grace window (racing fresh provision)", () => {
    const fresh = { id: OTHER, createdAt: new Date(NOW.getTime() - (SHOWCASE_RETIRE_GRACE_MS - 1_000)) }

    const retirable = selectRetirableShowcaseProjectIds({
      projects: [old(CURRENT), fresh, old(OLD)],
      currentProjectId: CURRENT,
      nextProjectId: null,
      now: NOW,
    })

    expect(retirable).toEqual([OLD])
  })

  it("retires an orphan exactly at the grace boundary", () => {
    const boundary = { id: OLD, createdAt: new Date(NOW.getTime() - SHOWCASE_RETIRE_GRACE_MS) }

    const retirable = selectRetirableShowcaseProjectIds({
      projects: [boundary],
      currentProjectId: CURRENT,
      nextProjectId: null,
      now: NOW,
    })

    expect(retirable).toEqual([OLD])
  })
})
