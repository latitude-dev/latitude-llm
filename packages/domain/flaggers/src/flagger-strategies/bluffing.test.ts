import { describe, expect, it } from "vitest"
import { bluffingStrategy, extractFailedToolEvents } from "./bluffing.ts"
import { assistant, makeTrace, tool, user } from "./test-helpers.ts"

const failingExchange = (assistantText?: string) =>
  makeTrace([
    user("Update the customer record."),
    { role: "assistant", parts: [{ type: "tool_call", id: "call-1", name: "update_record", arguments: { id: 7 } }] },
    tool("call-1", { error: "permission denied" }),
    ...(assistantText === undefined ? [] : [assistant(assistantText)]),
  ])

describe("extractFailedToolEvents", () => {
  it("pairs a failed tool response with the assistant text that follows it", () => {
    const events = extractFailedToolEvents(failingExchange("Done! The record is updated."))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      toolName: "update_record",
      responseMessageIndex: 2,
      followingAssistantIndex: 3,
      followingAssistantText: "Done! The record is updated.",
    })
    expect(events[0]?.errorSnippet).toContain("permission denied")
  })

  it("records a failure with no following assistant text", () => {
    const events = extractFailedToolEvents(failingExchange(undefined))

    expect(events).toHaveLength(1)
    expect(events[0]?.followingAssistantText).toBeNull()
  })

  it("ignores successful tool responses", () => {
    const conversation = makeTrace([
      { role: "assistant", parts: [{ type: "tool_call", id: "call-1", name: "update_record", arguments: {} }] },
      tool("call-1", { ok: true }),
      assistant("Done!"),
    ])
    expect(extractFailedToolEvents(conversation)).toEqual([])
  })

  it("surfaces sibling successful tool results from the same batch", () => {
    const conversation = makeTrace([
      {
        role: "assistant",
        parts: [
          { type: "tool_call", id: "call-ok", name: "code", arguments: { sheet: "A200" } },
          { type: "tool_call", id: "call-fail", name: "code", arguments: { sheet: "A102" } },
        ],
      },
      tool("call-ok", { ok: true, quotes: ["demolition plan"] }),
      tool("call-fail", { error: "Dynamic worker concurrency limit exceeded" }),
      assistant("I've organized the drawing-backed scope into packages using A200."),
    ])

    const events = extractFailedToolEvents(conversation)
    expect(events).toHaveLength(1)
    expect(events[0]?.siblingSuccessSnippets).toEqual([
      expect.stringContaining('code: {"ok":true,"quotes":["demolition plan"]}'),
    ])
  })
})

describe("bluffingStrategy", () => {
  it("requires a failed call followed by assistant text", () => {
    expect(bluffingStrategy.hasRequiredContext(failingExchange("All done."))).toBe(true)
    expect(bluffingStrategy.hasRequiredContext(failingExchange(undefined))).toBe(false)
    expect(bluffingStrategy.hasRequiredContext(makeTrace([user("hi"), assistant("hello")]))).toBe(false)
  })

  it("renders the failure and the assistant continuation into the prompt", () => {
    const prompt = bluffingStrategy.buildPrompt?.(failingExchange("Done! The record is updated."))

    expect(prompt).toContain("update_record")
    expect(prompt).toContain("permission denied")
    expect(prompt).toContain("Done! The record is updated.")
    expect(prompt).toContain("Sibling successful tool results before the assistant continued: none observed")
  })

  it("renders sibling successes into the prompt when present", () => {
    const conversation = makeTrace([
      {
        role: "assistant",
        parts: [
          { type: "tool_call", id: "call-ok", name: "code", arguments: {} },
          { type: "tool_call", id: "call-fail", name: "code", arguments: {} },
        ],
      },
      tool("call-ok", { ok: true, sheet: "A200" }),
      tool("call-fail", { error: "concurrency limit exceeded" }),
      assistant("Package 1 uses sheet A200."),
    ])

    const prompt = bluffingStrategy.buildPrompt?.(conversation)
    expect(prompt).toContain("Sibling successful tool results before the assistant continued (may ground the reply):")
    expect(prompt).toContain('"sheet":"A200"')
  })

  it("is hinted by tool errors and has no deterministic detector", () => {
    expect(bluffingStrategy.hintKinds).toContain("tool:error")
    expect(bluffingStrategy.detectDeterministically).toBeUndefined()
  })
})
