import type { TraceDetail } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { FLAGGER_BUNDLE_KEY_MAX_LENGTH, flaggerBundleKey } from "./flagger-bundle-key.ts"
import { classifyToolError, collectToolCallErrorFindings } from "./helpers.ts"

const assistantToolCall = (id: string, name = "fetch_user"): TraceDetail["allMessages"][number] => ({
  role: "assistant",
  parts: [{ type: "tool_call", id, name, arguments: {} }],
})

const toolResponse = (id: string, response: unknown): TraceDetail["allMessages"][number] => ({
  role: "tool",
  parts: [{ type: "tool_call_response", id, response }],
})

const failingTrace = (response: unknown) => ({
  allMessages: [assistantToolCall("call-1"), toolResponse("call-1", response)],
  outputMessages: [assistantToolCall("call-1")],
})

const errorFindingFor = (response: unknown) => {
  const finding = collectToolCallErrorFindings(failingTrace(response))[0]
  if (!finding) throw new Error("expected a tool error finding")
  return finding
}

describe("classifyToolError", () => {
  it("reads a declared status ahead of the prose", () => {
    expect(classifyToolError({ ok: false, status: 503, error: "upstream said no" })).toBe("http-503")
    expect(classifyToolError({ error: { statusCode: "429", message: "slow down" } })).toBe("http-429")
  })

  it("prefers the vendor's own code over the message", () => {
    expect(classifyToolError({ ok: false, error: { code: "ECONNRESET", message: "socket hang up" } })).toBe(
      "econnreset",
    )
  })

  it("collapses the per-occurrence detail two runs of one failure differ by", () => {
    const first = classifyToolError({ error: 'user "4f2a" not found after 3 attempts (/srv/api/users)' })
    const second = classifyToolError({ error: 'user "91bd" not found after 17 attempts (/srv/api/people)' })

    expect(first).toBe(second)
    expect(first).toBe("user-not-found-after-attempts")
  })

  it("falls back to a shared class rather than inventing one per response", () => {
    expect(classifyToolError({ ok: false })).toBe("unspecified")
  })

  // `toolResponseIndicatesFailure` treats a non-empty `errors` array as a failure,
  // so leaving it unclassified would file every such failure under one bucket.
  it("classes an errors array instead of collapsing it to the fallback", () => {
    const timeout = classifyToolError({ errors: [{ message: "timeout contacting upstream" }] })
    const notFound = classifyToolError({ errors: [{ message: "record not found" }] })

    expect(timeout).toBe("timeout-contacting-upstream")
    expect(notFound).toBe("record-not-found")
    expect(timeout).not.toBe(notFound)
  })

  it("reads a declared status inside an errors array", () => {
    expect(classifyToolError({ errors: [{ statusCode: 429, message: "slow down" }] })).toBe("http-429")
  })

  it("gives a message of pure separators the shared fallback class", () => {
    expect(classifyToolError({ error: `${"-".repeat(50_000)}!` })).toBe("unspecified")
    expect(classifyToolError("-".repeat(50_000))).toBe("unspecified")
  })

  // The scan limit is a work bound, not a classifier change: the slug keeps only
  // its first 48 characters, so truncating the input far above that must leave
  // the answer identical.
  it("classes an oversized message exactly as it classes a short one", () => {
    const short = classifyToolError({ error: "connection refused by upstream" })
    const padded = classifyToolError({ error: `connection refused by upstream ${"padding ".repeat(200_000)}` })

    expect(short).toBe("connection-refused-by-upstream")
    expect(padded.startsWith("connection-refused-by-upstream")).toBe(true)
    expect(padded.length).toBeLessThanOrEqual(FLAGGER_BUNDLE_KEY_MAX_LENGTH)
  })
})

describe("flaggerBundleKey", () => {
  it("puts one tool failing one way in one bucket", () => {
    const key = flaggerBundleKey({
      ...errorFindingFor({ ok: false, status: 503 }),
      findingKey: "a".repeat(64),
      flaggerSlug: "tool-call-errors",
      findingKind: "error",
      toolName: "fetch_user",
      toolCallId: "call-1",
      responseMessageIndex: 1,
      errorClass: "http-503",
    })

    expect(key).toBe("tool-call-errors:error:fetch_user:http-503")
  })

  it("separates two tools and two failure classes", () => {
    const base = {
      findingKey: "a".repeat(64),
      flaggerSlug: "tool-call-errors" as const,
      findingKind: "error" as const,
      toolCallId: "call-1",
      messageIndex: 0,
      responseMessageIndex: 1,
      feedback: "irrelevant",
    }

    expect(flaggerBundleKey({ ...base, toolName: "fetch_user", errorClass: "http-503" })).not.toBe(
      flaggerBundleKey({ ...base, toolName: "fetch_order", errorClass: "http-503" }),
    )
    expect(flaggerBundleKey({ ...base, toolName: "fetch_user", errorClass: "http-503" })).not.toBe(
      flaggerBundleKey({ ...base, toolName: "fetch_user", errorClass: "http-429" }),
    )
  })

  it("ignores recovery, which varies run to run while the broken tool does not", () => {
    const base = {
      findingKey: "a".repeat(64),
      flaggerSlug: "tool-call-errors" as const,
      findingKind: "error" as const,
      toolName: "fetch_user",
      toolCallId: "call-1",
      messageIndex: 0,
      responseMessageIndex: 1,
      feedback: "irrelevant",
      errorClass: "http-503",
    }

    expect(flaggerBundleKey({ ...base, recovered: true, terminal: false })).toBe(
      flaggerBundleKey({ ...base, recovered: false, terminal: true }),
    )
  })

  it("buckets a structural defect by tool alone", () => {
    expect(
      flaggerBundleKey({
        findingKey: "a".repeat(64),
        flaggerSlug: "tool-call-errors",
        findingKind: "duplicate",
        toolName: "fetch_user",
        toolCallId: "call-1",
        messageIndex: 0,
        feedback: "irrelevant",
      }),
    ).toBe("tool-call-errors:duplicate:fetch_user")
  })

  it("keeps two long tool names sharing a prefix in different buckets", () => {
    const base = {
      findingKey: "a".repeat(64),
      flaggerSlug: "tool-call-errors" as const,
      findingKind: "error" as const,
      toolCallId: "call-1",
      messageIndex: 0,
      responseMessageIndex: 1,
      feedback: "irrelevant",
      errorClass: "http-503",
    }
    const prefix = "mcp__composio__".concat("x".repeat(80))

    expect(flaggerBundleKey({ ...base, toolName: `${prefix}_alpha` })).not.toBe(
      flaggerBundleKey({ ...base, toolName: `${prefix}_beta` }),
    )
  })

  it("stays within the stored bound when the tool name is absurd", () => {
    const key = flaggerBundleKey({
      findingKey: "a".repeat(64),
      flaggerSlug: "tool-call-errors",
      findingKind: "error",
      toolName: "t".repeat(400),
      toolCallId: "call-1",
      messageIndex: 0,
      responseMessageIndex: 1,
      feedback: "irrelevant",
      errorClass: "e".repeat(400),
    })

    expect(key).not.toBeNull()
    expect((key as string).length).toBeLessThanOrEqual(FLAGGER_BUNDLE_KEY_MAX_LENGTH)
  })
})
