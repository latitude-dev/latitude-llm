import { describe, expect, it } from "vitest"
import { extractTaskEpisodes, incompletionStrategy, isClosedTaskEpisode } from "./incompletion.ts"
import { assistant, assistantToolCall, makeTrace, tool, user } from "./test-helpers.ts"

describe("extractTaskEpisodes", () => {
  it("builds one episode per assistant text turn with real transcript indices", () => {
    const trace = makeTrace([
      user("Write the report"), // 0
      assistant("Here is the report: ..."), // 1
      user("Thanks, now summarize it"), // 2
      assistant("Summary: ..."), // 3
    ])

    const episodes = extractTaskEpisodes(trace)

    expect(episodes).toHaveLength(2)
    expect(episodes[0]).toMatchObject({
      assistantMessageIndex: 1,
      taskMessages: ["Write the report"],
      reactionMessages: ["Thanks, now summarize it"],
    })
    expect(episodes[1]).toMatchObject({
      assistantMessageIndex: 3,
      taskMessages: ["Thanks, now summarize it"],
      reactionMessages: [],
    })
  })

  it("shares the user block between the prior episode's reaction and the next episode's task", () => {
    const trace = makeTrace([
      user("Fix the bug"),
      assistant("Done, I fixed it."),
      user("It still crashes, try again"),
      assistant("Fixed for real now."),
      user("Works, thanks!"),
    ])

    const episodes = extractTaskEpisodes(trace)

    expect(episodes[0]?.reactionMessages).toEqual(["It still crashes, try again"])
    expect(episodes[1]?.taskMessages).toEqual(["It still crashes, try again"])
    expect(episodes[1]?.reactionMessages).toEqual(["Works, thanks!"])
  })

  it("inherits the task across agentic continuation turns and ignores tool-only turns", () => {
    const trace = makeTrace([
      user("Deploy the service"), // 0
      assistant("Starting the deploy."), // 1
      assistantToolCall("deploy", {}), // 2 — no text, not an episode
      tool("tc_1", { ok: true }), // 3
      assistant("Deployed successfully."), // 4
      user("Nothing is running, you did not deploy it"), // 5
    ])

    const episodes = extractTaskEpisodes(trace)

    expect(episodes).toHaveLength(2)
    expect(episodes[0]).toMatchObject({ assistantMessageIndex: 1, reactionMessages: [] })
    expect(episodes[1]).toMatchObject({
      assistantMessageIndex: 4,
      taskMessages: ["Deploy the service"],
      reactionMessages: ["Nothing is running, you did not deploy it"],
    })
  })

  it("closes the last episode with trailing user messages", () => {
    const trace = makeTrace([user("Do X"), assistant("Done."), user("You did not do X")])

    const episodes = extractTaskEpisodes(trace)

    expect(episodes).toHaveLength(1)
    expect(isClosedTaskEpisode(episodes[0]!)).toBe(true)
  })
})

describe("incompletionStrategy.hasRequiredContext", () => {
  it("is false for a single exchange with no user reaction yet", () => {
    expect(incompletionStrategy.hasRequiredContext(makeTrace([user("Do X"), assistant("Done.")]))).toBe(false)
  })

  it("is false when the assistant speaks without any user task", () => {
    expect(incompletionStrategy.hasRequiredContext(makeTrace([assistant("Hello!"), assistant("Anyone there?")]))).toBe(
      false,
    )
  })

  it("is true once an assistant response has a user reaction", () => {
    expect(
      incompletionStrategy.hasRequiredContext(makeTrace([user("Do X"), assistant("Done."), user("Where is it?")])),
    ).toBe(true)
  })
})

describe("incompletionStrategy.validateMatch", () => {
  const trace = makeTrace([
    user("Translate this document"), // 0
    assistant("Here is a partial translation."), // 1
    user("You only translated half, do the rest"), // 2
    assistant("Here is the full translation."), // 3
  ])

  it("rejects a match without a messageIndex", () => {
    expect(incompletionStrategy.validateMatch!(trace, { feedback: "Task not completed" })).toBe(false)
  })

  it("rejects the final assistant response (open episode)", () => {
    expect(incompletionStrategy.validateMatch!(trace, { feedback: "Task not completed", messageIndex: 3 })).toBe(false)
  })

  it("rejects indices that are not assistant episode anchors", () => {
    expect(incompletionStrategy.validateMatch!(trace, { feedback: "Task not completed", messageIndex: 2 })).toBe(false)
  })

  it("accepts the assistant response of a closed episode", () => {
    expect(incompletionStrategy.validateMatch!(trace, { feedback: "Task not completed", messageIndex: 1 })).toBe(true)
  })
})

describe("incompletionStrategy.buildPrompt", () => {
  it("presents only closed episodes, never the trailing assistant response", () => {
    const trace = makeTrace([
      user("Generate the invoice"),
      assistant("I generated a draft without totals."),
      user("The totals are missing, please redo it"),
      assistant("FINAL-ANSWER-NOT-YET-REACTED-TO"),
    ])

    const prompt = incompletionStrategy.buildPrompt!(trace)

    expect(prompt).toContain('index="1"')
    expect(prompt).toContain("The totals are missing, please redo it")
    expect(prompt).not.toContain("FINAL-ANSWER-NOT-YET-REACTED-TO")
  })

  it("keeps complaint-bearing episodes when capping a long session", () => {
    const filler = Array.from({ length: 8 }, (_, i) => [user(`Task ${i}`), assistant(`Result ${i}`)]).flat()
    const trace = makeTrace([...filler, user("You did not do task 7, try again"), assistant("Redoing it."), user("ok")])

    const prompt = incompletionStrategy.buildPrompt!(trace)

    expect(prompt).toContain("You did not do task 7, try again")
  })
})

describe("incompletionStrategy CES-Z2SW product-crash exclusions", () => {
  it("rejects product crash reports after relaunch as non-delivery evidence", () => {
    const systemPrompt = incompletionStrategy.buildSystemPrompt?.(makeTrace([user("hello")]))
    expect(systemPrompt).toBeTruthy()

    expect(systemPrompt).toContain("Product runtime / crash / defect reports")
    expect(systemPrompt).toContain("hm ios crashes?")
    expect(systemPrompt).toContain('false claims of successful task completion')
    expect(systemPrompt).toContain("you didn't reopen it")
    expect(systemPrompt).toContain(
      "Do NOT treat a later product defect report as contradicting a launch/build/open/relaunch claim",
    )
  })

  it("documents the exclusion in annotator instructions", () => {
    expect(incompletionStrategy.annotator?.instructions).toContain("product crash/bug reports")
    expect(incompletionStrategy.annotator?.instructions).toContain("launch/build/open/relaunch")
    expect(incompletionStrategy.annotator?.instructions).toContain("does not deny that the action itself was performed")
  })
})
