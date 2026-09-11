import { describe, expect, it } from "vitest"
import type { FlaggerConversation } from "../conversation.ts"
import { extractJudgedTranscript, taskFailureStrategy } from "./task-failure.ts"

const text = (content: string) => [{ type: "text", content }]

const conversationOf = (messages: FlaggerConversation["allMessages"]): FlaggerConversation => ({
  allMessages: messages,
  outputMessages: messages,
  systemInstructions: [],
  tags: [],
  tokensInput: 0,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
})

const exchange = (turns: number): FlaggerConversation["allMessages"] =>
  Array.from({ length: turns * 2 }, (_, index) =>
    index % 2 === 0
      ? { role: "user" as const, parts: text(`Request number ${index}`) }
      : { role: "assistant" as const, parts: text(`Response number ${index}`) },
  )

describe("extractJudgedTranscript", () => {
  it("keeps the real transcript index so the judge's anchor survives", () => {
    const turns = extractJudgedTranscript(
      conversationOf([
        { role: "system", parts: text("You are helpful") },
        { role: "user", parts: text("Cancel my subscription") },
        { role: "assistant", parts: text("Done") },
      ]),
    )

    expect(turns).toEqual([
      { messageIndex: 1, role: "user", text: "Cancel my subscription", toolNames: [] },
      { messageIndex: 2, role: "assistant", text: "Done", toolNames: [] },
    ])
  })

  it("records assistant tool calls and drops tool responses", () => {
    const turns = extractJudgedTranscript(
      conversationOf([
        { role: "user", parts: text("Refund order 12") },
        {
          role: "assistant",
          parts: [
            { type: "text", content: "Refunding now" },
            { type: "tool_call", name: "issue_refund", arguments: { orderId: 12 } },
            { type: "tool_call", name: "issue_refund", arguments: { orderId: 12 } },
          ],
        },
        { role: "tool", parts: [{ type: "tool_call_response", response: { ok: true } }] },
      ]),
    )

    expect(turns).toHaveLength(2)
    expect(turns[1]).toMatchObject({ role: "assistant", text: "Refunding now", toolNames: ["issue_refund"] })
  })

  it("skips turns that carry neither text nor a tool call", () => {
    const turns = extractJudgedTranscript(
      conversationOf([
        { role: "user", parts: text("   ") },
        { role: "assistant", parts: [{ type: "reasoning", content: "thinking" }] },
        { role: "user", parts: text("Still there?") },
      ]),
    )

    expect(turns).toEqual([{ messageIndex: 2, role: "user", text: "Still there?", toolNames: [] }])
  })
})

describe("taskFailureStrategy.hasRequiredContext", () => {
  it("requires a user-authored task", () => {
    const conversation = conversationOf([{ role: "assistant", parts: text("Anything else?") }])

    expect(taskFailureStrategy.hasRequiredContext(conversation)).toBe(false)
  })

  it("requires an assistant turn to judge", () => {
    const conversation = conversationOf([{ role: "user", parts: text("Cancel my subscription") }])

    expect(taskFailureStrategy.hasRequiredContext(conversation)).toBe(false)
  })

  it("does not treat a tool-only user turn as a task", () => {
    const conversation = conversationOf([
      { role: "user", parts: text("  ") },
      { role: "assistant", parts: text("Done") },
    ])

    expect(taskFailureStrategy.hasRequiredContext(conversation)).toBe(false)
  })

  it("accepts a session with a user task and an assistant turn", () => {
    const conversation = conversationOf([
      { role: "user", parts: text("Cancel my subscription") },
      { role: "assistant", parts: text("Done") },
    ])

    expect(taskFailureStrategy.hasRequiredContext(conversation)).toBe(true)
  })
})

describe("taskFailureStrategy.buildPrompt", () => {
  it("labels every turn with the transcript index the judge may cite", () => {
    const prompt = taskFailureStrategy.buildPrompt?.(
      conversationOf([
        { role: "user", parts: text("Cancel my subscription") },
        { role: "assistant", parts: text("Cancelled, you keep access until March") },
      ]),
    )

    expect(prompt).toContain("SESSION TRANSCRIPT (2 turns):")
    expect(prompt).toContain("--- Turn at transcript index 0 (user) ---")
    expect(prompt).toContain('<evaluated_trace_assistant_response index="1"')
    expect(prompt).toContain("Cancel my subscription")
  })

  it("keeps the opening and closing turns and says how many it dropped", () => {
    const prompt = taskFailureStrategy.buildPrompt?.(conversationOf(exchange(20)))

    expect(prompt).toContain("Request number 0")
    expect(prompt).toContain("Response number 39")
    // A middle assistant turn is what the window sheds.
    expect(prompt).not.toContain("Response number 21")
  })

  // The judge scores goals, and goals come from the user. Dropping a
  // mid-session request would let it call a session successful while the goal
  // it never saw sat unresolved.
  it("keeps every mid-session user turn even when the window drops the middle", () => {
    const prompt = taskFailureStrategy.buildPrompt?.(conversationOf(exchange(20)))

    expect(prompt).toContain("Request number 20")
    expect(prompt).toContain("middle assistant turns omitted, every mid-session user turn kept")
  })

  it("bounds the mid-session user turns it carries", () => {
    const prompt = taskFailureStrategy.buildPrompt?.(conversationOf(exchange(60)))
    const carried = [...(prompt ?? "").matchAll(/Request number (\d+)/g)].map((match) => Number(match[1]))

    expect(carried.length).toBeLessThanOrEqual(6 + 12 + 10)
    expect(prompt).toContain("Request number 0")
  })

  it("asks for notApplicable when no turn carried evidence", () => {
    const prompt = taskFailureStrategy.buildPrompt?.(conversationOf([]))

    expect(prompt).toContain("Return notApplicable")
  })
})
