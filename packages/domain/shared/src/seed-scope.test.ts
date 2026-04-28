import { describe, expect, it } from "vitest"
import { CUID_LENGTH, OrganizationId, ProjectId } from "./id.ts"
import { createSeedScope } from "./seed-scope.ts"

const baseInput = {
  organizationId: OrganizationId("org-test"),
  projectId: ProjectId("project-test"),
  timelineAnchor: new Date("2025-01-01T00:00:00.000Z"),
  queueAssigneeUserIds: ["user-test"] as const,
}

describe("createSeedScope — derivation", () => {
  it("produces a 24-char CUID-shaped id from cuid()", () => {
    const scope = createSeedScope(baseInput)
    const id = scope.cuid("dataset:warranty")
    expect(id).toHaveLength(CUID_LENGTH)
    expect(id).toMatch(/^[a-f0-9]+$/) // hex is a strict subset of cuid alphabet
  })

  it("produces a UUID v4-shaped string from uuid()", () => {
    const scope = createSeedScope(baseInput)
    const id = scope.uuid("issue:warranty-fab")
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  })

  it("produces a 32-char hex string from traceHex()", () => {
    const scope = createSeedScope(baseInput)
    expect(scope.traceHex("annotation", 0)).toMatch(/^[a-f0-9]{32}$/)
  })

  it("produces a 16-char hex string from spanHex()", () => {
    const scope = createSeedScope(baseInput)
    expect(scope.spanHex("annotation", 0)).toMatch(/^[a-f0-9]{16}$/)
  })

  it("is deterministic for the same (projectId, key)", () => {
    const a = createSeedScope(baseInput)
    const b = createSeedScope(baseInput)
    expect(a.cuid("dataset:warranty")).toBe(b.cuid("dataset:warranty"))
    expect(a.traceHex("annotation", 5)).toBe(b.traceHex("annotation", 5))
  })

  it("produces distinct ids for distinct projectIds", () => {
    // Critical for the demo flow: two demo projects under the same org must
    // not collide on trace/span/entity ids in ClickHouse / Postgres.
    const projectA = createSeedScope({ ...baseInput, projectId: ProjectId("project-a") })
    const projectB = createSeedScope({ ...baseInput, projectId: ProjectId("project-b") })
    expect(projectA.cuid("dataset:warranty")).not.toBe(projectB.cuid("dataset:warranty"))
    expect(projectA.traceHex("annotation", 0)).not.toBe(projectB.traceHex("annotation", 0))
  })

  it("produces distinct ids for distinct indices on the same key", () => {
    const scope = createSeedScope(baseInput)
    const ids = Array.from({ length: 16 }, (_, i) => scope.traceHex("annotation", i))
    expect(new Set(ids).size).toBe(16)
  })
})

describe("createSeedScope — overrides", () => {
  it("returns the override value when defined", () => {
    const scope = createSeedScope({
      ...baseInput,
      overrides: {
        cuid: (key) => (key === "dataset:warranty" ? "literal-id-from-bootstrap" : undefined),
      },
    })
    expect(scope.cuid("dataset:warranty")).toBe("literal-id-from-bootstrap")
  })

  it("falls through to derivation when the override returns undefined", () => {
    // Crucial for forward-compatibility: the bootstrap override map only
    // covers fixture keys that exist today. A new fixture key the seed
    // bodies introduce later must produce a deterministic project-scoped
    // id even before the bootstrap map is updated.
    const scope = createSeedScope({
      ...baseInput,
      overrides: {
        cuid: (key) => (key === "dataset:warranty" ? "literal-id-from-bootstrap" : undefined),
      },
    })
    const fallback = scope.cuid("dataset:future-fixture")
    expect(fallback).toHaveLength(CUID_LENGTH)
    expect(fallback).not.toBe("literal-id-from-bootstrap")
  })

  it("applies the override per-method independently", () => {
    const scope = createSeedScope({
      ...baseInput,
      overrides: {
        traceHex: (key, index) =>
          key === "annotation" ? `00000000${index.toString(16).padStart(24, "0")}` : undefined,
      },
    })
    // traceHex override hit
    expect(scope.traceHex("annotation", 0)).toBe(`00000000${"0".repeat(24)}`)
    // spanHex falls through (no override defined)
    expect(scope.spanHex("annotation", 0)).toMatch(/^[a-f0-9]{16}$/)
  })
})
