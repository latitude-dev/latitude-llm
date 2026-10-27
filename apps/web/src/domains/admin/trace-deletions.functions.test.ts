import { describe, expect, it } from "vitest"
import {
  adminCreateTraceDeletionInputSchema,
  adminTraceDeletionSelectorSchema,
  TRACE_DELETION_CONFIRMATION,
  toTraceDeletionFilters,
} from "./trace-deletions.functions.ts"

describe("adminCreateTraceDeletionInputSchema", () => {
  it("requires the exact confirmation phrase", () => {
    expect(
      adminCreateTraceDeletionInputSchema.safeParse({
        projectId: "proj-1",
        tag: "customer:acme",
        confirmation: TRACE_DELETION_CONFIRMATION,
      }).success,
    ).toBe(true)
    expect(
      adminCreateTraceDeletionInputSchema.safeParse({ projectId: "proj-1", tag: "customer:acme", confirmation: "yes" })
        .success,
    ).toBe(false)
  })

  it("rejects malformed trace ids, too many of them, and unsafe metadata keys", () => {
    expect(adminTraceDeletionSelectorSchema.safeParse({ projectId: "p", traceIds: ["short"] }).success).toBe(false)
    expect(
      adminTraceDeletionSelectorSchema.safeParse({
        projectId: "p",
        traceIds: Array.from({ length: 101 }, () => "a".repeat(32)),
      }).success,
    ).toBe(false)
    expect(adminTraceDeletionSelectorSchema.safeParse({ projectId: "p", metadataKey: "a/b" }).success).toBe(false)
  })

  it("rejects a half-filled metadata pair instead of dropping it", () => {
    expect(
      adminTraceDeletionSelectorSchema.safeParse({ projectId: "p", tag: "x", metadataKey: "customer_id" }).success,
    ).toBe(false)
    expect(
      adminTraceDeletionSelectorSchema.safeParse({ projectId: "p", tag: "x", metadataValue: "acme" }).success,
    ).toBe(false)
  })
})

describe("toTraceDeletionFilters", () => {
  it("selects like the matching trace-list filters", () => {
    expect(
      toTraceDeletionFilters({
        projectId: "p",
        tag: "customer:acme",
        userId: "user-1",
        sessionId: "session-1",
        metadataKey: "customer_id",
        metadataValue: "acme",
      }),
    ).toEqual({
      tags: [{ op: "contains", value: "customer:acme" }],
      userId: [{ op: "eq", value: "user-1" }],
      sessionId: [{ op: "eq", value: "session-1" }],
      "metadata.customer_id": [{ op: "eq", value: "acme" }],
    })
  })

  it("ignores blank fields", () => {
    expect(toTraceDeletionFilters({ projectId: "p", tag: "", userId: "" })).toEqual({})
  })
})
