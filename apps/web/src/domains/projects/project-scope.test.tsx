// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { getCurrentProjectScope, LIVE_SCOPE, SHOWCASE_SCOPE } from "./project-scope.tsx"

const at = (path: string) => window.history.pushState({}, "", path)

afterEach(() => at("/"))

describe("getCurrentProjectScope (derived from the URL)", () => {
  it("is live by default", () => {
    expect(getCurrentProjectScope()).toEqual(LIVE_SCOPE)
  })

  it("is live for an ordinary project", () => {
    at("/projects/my-project/signals")
    expect(getCurrentProjectScope()).toEqual(LIVE_SCOPE)
  })

  it("is showcase for the reserved slug and its subpaths", () => {
    at("/projects/lat-demo")
    expect(getCurrentProjectScope()).toEqual(SHOWCASE_SCOPE)
    at("/projects/lat-demo/monitors")
    expect(getCurrentProjectScope()).toEqual(SHOWCASE_SCOPE)
  })

  it("is sandbox with the org id from the path", () => {
    at("/sandbox/org_abc123/projects/x")
    expect(getCurrentProjectScope()).toEqual({ kind: "sandbox", orgId: "org_abc123" })
  })

  it("is live outside the project/sandbox routes", () => {
    at("/settings/billing")
    expect(getCurrentProjectScope()).toEqual(LIVE_SCOPE)
  })
})
