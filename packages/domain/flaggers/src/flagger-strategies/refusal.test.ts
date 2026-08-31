import { describe, expect, it } from "vitest"
import { refusalStrategy } from "./refusal.ts"
import { assistant, makeTrace, user } from "./test-helpers.ts"

describe("refusalStrategy", () => {
  it("treats a missing-tool document request as a capability refusal in the system prompt", () => {
    const system = refusalStrategy.buildSystemPrompt?.(makeTrace([])) ?? ""

    expect(system).toContain("declared toolset")
    expect(system).toContain("none of those tools can fulfill")
    expect(system).toContain("even if the assistant wrongly cites policy")
    expect(system).toContain("Do not infer extra capabilities from the agent's role")
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
