import { describe, expect, it } from "vitest"
import { refusalStrategy } from "./refusal.ts"
import { assistant, makeTrace, user } from "./test-helpers.ts"

describe("refusalStrategy", () => {
  it("treats a missing-tool document request as a capability refusal in the system prompt", () => {
    const system = refusalStrategy.buildSystemPrompt?.(makeTrace([])) ?? ""

    expect(system).toContain("declared toolset")
    expect(system).toContain("inherently require an external action, a tool, or an unsupported modality")
    expect(system).toContain("none of those tools can fulfill")
    expect(system).toContain("even if the assistant wrongly cites policy")
    expect(system).toContain("Do not infer extra capabilities from the agent's role")
    expect(system).toContain("attach or export a PDF")
    expect(system).toContain("query, remind, or check dispute status")
  })

  it("keeps native LLM work in-capability when a declared toolset is present", () => {
    const system = refusalStrategy.buildSystemPrompt?.(makeTrace([])) ?? ""

    expect(system).toContain("Do not treat the declared toolset as the exclusive capability set")
    expect(system).toContain("summarizing pasted text")
    expect(system).toContain("answering a factual question")
    expect(system).toContain("refusing those is still an incorrect refusal")
  })

  it("does not embed the declared toolset in strategy evidence — that is injected by run-flagger", () => {
    const prompt = refusalStrategy.buildPrompt?.(
      makeTrace([
        user("Can you attach the PDF of INV-2026352? I need to forward it to our auditor."),
        assistant("I can't do that. Sharing invoice documents is against policy, so I have to refuse."),
      ]),
    )

    expect(prompt).toContain("CANDIDATE STAGES")
    expect(prompt).toContain("INV-2026352")
    expect(prompt).not.toContain("EVALUATED AGENT AVAILABLE TOOLS")
  })
})
