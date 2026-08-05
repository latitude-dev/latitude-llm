import { describe, expect, it } from "vitest"
import { forgettingStrategy } from "./forgetting.ts"
import { extractConversationStages } from "./refusal.ts"
import { assistant, makeTrace, system, user } from "./test-helpers.ts"

// ATL-QU8W: the memory-augmented Atlas agent carried a stale "Rome in October"
// record in its system prompt while every conversation stage planned Vienna.
// The classifier cited that memory as "Stage 1" and flagged forgetting.
const MEMORY_SYSTEM_PROMPT = `You are Atlas, a travel planning assistant.

You remember travelers between conversations. What you already know about this traveler is given
below under "What you know".

What you know about this traveler:
- trips/rome-october: Trip to Rome from London being planned for October.`

const makeMemoryAgentTrace = () =>
  makeTrace([
    system(MEMORY_SYSTEM_PROMPT),
    user("I need to be in Vienna by Thursday morning. What flights work from London?"),
    assistant("From London to Vienna: Vueling VY2933 at 10:40 for 220 EUR, or a late-evening Ryanair at 58."),
    user("Need a place near the central station in Vienna for September."),
    assistant("In Vienna under 90 EUR/night: Alfama Guesthouse at 58 EUR is the pick."),
    user("Rainy-day plan for Vienna? The forecast for our 3 days looks grim."),
    assistant("Vienna, 3 days: day 1 old town on foot; day 2 the two big sights early; day 3 one museum."),
  ])

describe("extractConversationStages", () => {
  it("never turns system-prompt content into stage evidence", () => {
    const stages = extractConversationStages(makeMemoryAgentTrace())

    expect(stages).toHaveLength(3)
    for (const stage of stages) {
      expect(stage.userMessages.join("\n")).not.toContain("Rome")
      expect(stage.assistantMessage ?? "").not.toContain("Rome")
    }
  })
})

describe("forgettingStrategy", () => {
  it("keeps memory-only facts out of the staged evidence prompt (ATL-QU8W)", () => {
    const prompt = forgettingStrategy.buildPrompt?.(makeMemoryAgentTrace()) ?? ""

    expect(prompt).toContain("Vienna")
    expect(prompt).not.toContain("Rome")
  })

  it("instructs the classifier to ignore system-prompt and injected-memory facts", () => {
    const systemPrompt = forgettingStrategy.buildSystemPrompt?.(makeMemoryAgentTrace()) ?? ""

    expect(systemPrompt).toContain("never an earlier stage of this conversation")
    expect(systemPrompt).toContain("stale memory is not the assistant forgetting")
    expect(systemPrompt).toContain("Never cite the evaluated agent's system prompt or injected memory")
  })
})
