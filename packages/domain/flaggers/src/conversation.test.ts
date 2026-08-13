import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { buildFlaggerSessionContext, computeFlaggerAnchorContentHash } from "./conversation.ts"
import { assistant, assistantToolCall, makeSessionDetail, makeTrace, user } from "./flagger-strategies/test-helpers.ts"

const hashOf = (conversation: Parameters<typeof computeFlaggerAnchorContentHash>[0], messageIndex?: number) =>
  Effect.runPromise(computeFlaggerAnchorContentHash(conversation, messageIndex))

describe("computeFlaggerAnchorContentHash", () => {
  it("is stable when the anchored message shifts index (append growth / compaction renumbering)", async () => {
    const original = makeTrace([user("Please help me with this."), assistant("I refuse.")])
    const grown = makeTrace([
      user("hi"),
      assistant("hello!"),
      user("Please help me with this."),
      assistant("I refuse."),
    ])

    expect(await hashOf(original, 1)).toBe(await hashOf(grown, 3))
  })

  it("differs for different anchored content", async () => {
    const conversation = makeTrace([user("hi"), assistant("first"), assistant("second")])
    expect(await hashOf(conversation, 1)).not.toBe(await hashOf(conversation, 2))
  })

  it("anchors to the last assistant message when no index is given", async () => {
    const conversation = makeTrace([user("hi"), assistant("the answer")])
    const withTrailingUser = makeTrace([user("hi"), assistant("the answer"), user("thanks")])
    const withNewAssistant = makeTrace([user("hi"), assistant("the answer"), assistant("more")])

    expect(await hashOf(conversation)).toBe(await hashOf(withTrailingUser))
    expect(await hashOf(conversation)).not.toBe(await hashOf(withNewAssistant))
  })

  it("includes tool-call content so tool-anchored flags stay distinct", async () => {
    const callA = makeTrace([assistantToolCall("search", { q: "a" })])
    const callB = makeTrace([assistantToolCall("search", { q: "b" })])

    expect(await hashOf(callA, 0)).not.toBe(await hashOf(callB, 0))
  })

  it("falls back to an out-of-range index gracefully", async () => {
    const conversation = makeTrace([user("hi"), assistant("answer")])
    expect(await hashOf(conversation, 99)).toBe(await hashOf(conversation))
  })
})

describe("buildFlaggerSessionContext", () => {
  it("builds the conversation as system + last input window + output (moments alignment)", () => {
    const session = makeSessionDetail([user("question"), assistant("answer")], {
      systemInstructions: [{ type: "text", content: "You are helpful." }] as never,
    })

    const context = buildFlaggerSessionContext(session, "t".repeat(32))

    expect(context.conversation.allMessages).toHaveLength(3)
    expect(context.conversation.allMessages[0]?.role).toBe("system")
    expect(context.conversation.allMessages[1]?.role).toBe("user")
    expect(context.conversation.allMessages[2]?.role).toBe("assistant")
    expect(context.latestTraceId).toBe("t".repeat(32))
  })

  it("carries token aggregates, tags, and defined tools from the session", () => {
    const session = makeSessionDetail([user("q"), assistant("a")], {
      tokensInput: 100,
      tokensCacheRead: 50,
      tokensCacheCreate: 25,
      tags: ["tag-1"],
      definedTools: ["search"],
    })

    const context = buildFlaggerSessionContext(session, "t".repeat(32))

    expect(context.conversation.tokensInput).toBe(100)
    expect(context.conversation.tokensCacheRead).toBe(50)
    expect(context.conversation.tokensCacheCreate).toBe(25)
    expect(context.conversation.tags).toEqual(["tag-1"])
    expect(context.conversation.definedTools).toEqual(["search"])
  })
})
