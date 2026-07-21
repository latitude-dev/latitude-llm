import { AI_GENERATE_TELEMETRY_TAGS } from "@domain/ai"
import { describe, expect, it } from "vitest"
import { frustrationStrategy } from "./frustration.ts"
import { assistant, makeTrace, system, user } from "./test-helpers.ts"

describe("frustrationStrategy.hasRequiredContext", () => {
  it("is true when the conversation has a user message", () => {
    expect(frustrationStrategy.hasRequiredContext(makeTrace([user("This is useless.")]))).toBe(true)
  })

  it("is false for flagger.classify telemetry (no human user)", () => {
    const classifyPrompt = [
      "TRACE EVIDENCE:",
      "<evaluated_trace_evidence>",
      '<evaluated_trace_user_message format="json">',
      JSON.stringify({ role: "user", content: "I already asked you to verify the poses." }),
      "</evaluated_trace_user_message>",
      "</evaluated_trace_evidence>",
    ].join("\n")

    const trace = {
      ...makeTrace([
        system("You are a triage flagger for Incompletion."),
        user(classifyPrompt),
        assistant('{"matched":true,"feedback":"Task not completed","messageIndex":"25"}'),
      ]),
      tags: [...AI_GENERATE_TELEMETRY_TAGS.flaggerClassify],
    }

    expect(frustrationStrategy.hasRequiredContext(trace)).toBe(false)
  })

  it("is false for flagger.draft telemetry", () => {
    const trace = {
      ...makeTrace([user("I already told you this is broken.")]),
      tags: [...AI_GENERATE_TELEMETRY_TAGS.flaggerDraft],
    }

    expect(frustrationStrategy.hasRequiredContext(trace)).toBe(false)
  })
})

describe("frustrationStrategy.validateMatch", () => {
  const trace = makeTrace([
    system("You are helpful."), // 0
    user("I already told you to use TypeScript."), // 1
    assistant("Sorry — switching to TypeScript now."), // 2
  ])

  it("rejects a match without a messageIndex", () => {
    expect(frustrationStrategy.validateMatch!(trace, { feedback: "User is frustrated." })).toBe(false)
  })

  it("rejects a match anchored on an assistant response", () => {
    expect(
      frustrationStrategy.validateMatch!(trace, {
        feedback: "User is frustrated.",
        messageIndex: 2,
      }),
    ).toBe(false)
  })

  it("rejects a match anchored on a system message", () => {
    expect(
      frustrationStrategy.validateMatch!(trace, {
        feedback: "User is frustrated.",
        messageIndex: 0,
      }),
    ).toBe(false)
  })

  it("accepts a match anchored on the frustrated user message", () => {
    expect(
      frustrationStrategy.validateMatch!(trace, {
        feedback: "User restated a prior correction.",
        messageIndex: 1,
      }),
    ).toBe(true)
  })
})
