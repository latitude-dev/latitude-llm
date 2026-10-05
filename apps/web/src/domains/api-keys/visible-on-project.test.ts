import { describe, expect, it } from "vitest"
import { apiKeysVisibleOnProject } from "./visible-on-project.ts"

const keys = [
  { id: "org", projectId: null },
  { id: "this", projectId: "proj-support" },
  { id: "other", projectId: "proj-default" },
] as const

describe("apiKeysVisibleOnProject", () => {
  it("keeps the current project and org-wide keys", () => {
    expect(apiKeysVisibleOnProject(keys, "proj-support").map((key) => key.id)).toEqual(["org", "this"])
  })

  it("hides keys bound to a different project", () => {
    expect(apiKeysVisibleOnProject(keys, "proj-support").some((key) => key.id === "other")).toBe(false)
  })

  it("shows only org-wide keys when the current project is not known yet", () => {
    expect(apiKeysVisibleOnProject(keys, null).map((key) => key.id)).toEqual(["org"])
  })
})
