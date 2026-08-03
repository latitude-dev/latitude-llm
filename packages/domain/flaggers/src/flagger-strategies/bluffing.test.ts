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
  })

  it("is hinted by tool errors and has no deterministic detector", () => {
    expect(bluffingStrategy.hintKinds).toContain("tool:error")
    expect(bluffingStrategy.detectDeterministically).toBeUndefined()
  })
})
