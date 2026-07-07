import { describe, expect, it } from "vitest"
import type { ProjectScope } from "../domains/projects/project-scope.tsx"
import { isBlockedWrite } from "./write-gate-middleware.ts"

const LIVE: ProjectScope = { kind: "live" }
const SHOWCASE: ProjectScope = { kind: "showcase" }
const SANDBOX: ProjectScope = { kind: "sandbox", orgId: "org-123" }

describe("isBlockedWrite", () => {
  it("never blocks under the live scope, regardless of method", () => {
    expect(isBlockedWrite({ scope: LIVE, method: "POST", serverFnName: "createAnnotation" })).toBe(false)
    expect(isBlockedWrite({ scope: LIVE, method: "GET", serverFnName: "listSignals" })).toBe(false)
  })

  it("never blocks under the sandbox scope (Test Mode stays writable)", () => {
    expect(isBlockedWrite({ scope: SANDBOX, method: "POST", serverFnName: "createAnnotation" })).toBe(false)
  })

  it("allows all GET requests under the read-only showcase scope", () => {
    expect(isBlockedWrite({ scope: SHOWCASE, method: "GET", serverFnName: "listSignals" })).toBe(false)
  })

  it("blocks a non-allowlisted POST under the read-only showcase scope", () => {
    expect(isBlockedWrite({ scope: SHOWCASE, method: "POST", serverFnName: "createAnnotation" })).toBe(true)
    expect(isBlockedWrite({ scope: SHOWCASE, method: "POST", serverFnName: "createMonitor" })).toBe(true)
  })

  it("allows the POST-read/session-write allowlist under the read-only showcase scope", () => {
    for (const serverFnName of [
      "previewEvaluation",
      "listLinearTeamsForApiKey",
      "listCursorRepositoriesForApiKey",
      "rememberLastProjectSlug",
    ]) {
      expect(isBlockedWrite({ scope: SHOWCASE, method: "POST", serverFnName })).toBe(false)
    }
  })

  it("fails closed on an unidentifiable POST under the read-only showcase scope", () => {
    expect(isBlockedWrite({ scope: SHOWCASE, method: "POST", serverFnName: undefined })).toBe(true)
  })
})
