import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { buildFlaggerFinding } from "../helpers.ts"
import {
  deterministicFlaggerFindingReadSchema,
  type FlaggerFindingScope,
  flaggerFindingSchema,
} from "./flagger-finding.ts"

const scope = {
  organizationId: OrganizationId("org_123"),
  projectId: ProjectId("proj_123"),
  sessionId: SessionId("session-123"),
} satisfies FlaggerFindingScope

describe("flaggerFindingSchema", () => {
  it("accepts fields belonging to the selected finding kind", () => {
    expect(
      flaggerFindingSchema.parse({
        findingKey: "a".repeat(64),
        flaggerSlug: "tool-call-errors",
        findingKind: "error",
        feedback: "Tool failed",
        messageIndex: 2,
        toolName: "search",
        toolCallId: "call-1",
        responseMessageIndex: 3,
        recovered: true,
        sameSubjectRecovered: false,
        terminal: false,
      }),
    ).toMatchObject({ findingKind: "error", recovered: true, sameSubjectRecovered: false, terminal: false })
  })

  it("rejects fields that do not belong to the selected finding kind", () => {
    expect(() =>
      flaggerFindingSchema.parse({
        findingKey: "a".repeat(64),
        flaggerSlug: "empty-response",
        findingKind: "blank",
        feedback: "Assistant response was blank",
        messageIndex: 2,
        recovered: true,
      }),
    ).toThrow()
  })

  it("rejects unbounded finding kinds", () => {
    expect(() =>
      flaggerFindingSchema.parse({
        findingKey: "a".repeat(64),
        flaggerSlug: "empty-response",
        findingKind: "something-new",
        feedback: "Unknown finding",
      }),
    ).toThrow()
  })
})

describe("deterministicFlaggerFindingReadSchema", () => {
  it("distinguishes examined with no findings from unreadable", () => {
    expect(deterministicFlaggerFindingReadSchema.parse({ readable: true, findings: [] })).toEqual({
      readable: true,
      findings: [],
    })
    expect(deterministicFlaggerFindingReadSchema.parse({ readable: false, findings: [] })).toEqual({
      readable: false,
      findings: [],
    })
  })

  it("rejects findings on an unreadable result", () => {
    expect(() =>
      deterministicFlaggerFindingReadSchema.parse({
        readable: false,
        findings: [
          {
            findingKey: "a".repeat(64),
            flaggerSlug: "empty-response",
            findingKind: "blank",
            feedback: "Assistant response was blank",
          },
        ],
      }),
    ).toThrow()
  })
})

describe("buildFlaggerFinding", () => {
  const build = (overrides?: Partial<FlaggerFindingScope>) =>
    Effect.runPromise(
      buildFlaggerFinding({
        scope: { ...scope, ...overrides },
        sourceIdentity: "message:content-hash",
        finding: {
          flaggerSlug: "empty-response",
          findingKind: "blank",
          feedback: "Assistant response was blank",
          messageIndex: 2,
        },
      }),
    )

  it("is stable for the same source fact", async () => {
    const first = await build()
    const second = await build()

    expect(first.findingKey).toBe(second.findingKey)
    expect(first.findingKey).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is scoped by organization, project, and session", async () => {
    const original = await build()
    const otherSession = await build({ sessionId: SessionId("session-456") })

    expect(original.findingKey).not.toBe(otherSession.findingKey)
  })

  it("does not include mutable feedback in identity", async () => {
    const original = await build()
    const renamed = await Effect.runPromise(
      buildFlaggerFinding({
        scope,
        sourceIdentity: "message:content-hash",
        finding: {
          flaggerSlug: "empty-response",
          findingKind: "blank",
          feedback: "A clearer description of the same fact",
          messageIndex: 2,
        },
      }),
    )

    expect(original.findingKey).toBe(renamed.findingKey)
  })

  it("changes when the immutable source anchor changes", async () => {
    const original = await build()
    const otherSource = await Effect.runPromise(
      buildFlaggerFinding({
        scope,
        sourceIdentity: "message:other-content-hash",
        finding: {
          flaggerSlug: "empty-response",
          findingKind: "blank",
          feedback: "Assistant response was blank",
          messageIndex: 2,
        },
      }),
    )

    expect(original.findingKey).not.toBe(otherSource.findingKey)
  })

  it("changes when the finding kind changes", async () => {
    const original = await build()
    const otherKind = await Effect.runPromise(
      buildFlaggerFinding({
        scope,
        sourceIdentity: "message:content-hash",
        finding: {
          flaggerSlug: "empty-response",
          findingKind: "unconfirmedPattern",
          feedback: "Assistant response was a repeated character",
          messageIndex: 2,
        },
      }),
    )

    expect(original.findingKey).not.toBe(otherKind.findingKey)
  })
})
