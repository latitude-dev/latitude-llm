import { describe, expect, it } from "vitest"
import { GEPA_PROPOSER_SYSTEM_PROMPT } from "./proposer.ts"

describe("GEPA_PROPOSER_SYSTEM_PROMPT", () => {
  it("constrains the only interpolation placeholder to session.conversation", () => {
    expect(GEPA_PROPOSER_SYSTEM_PROMPT).toContain("${session.conversation}")
    // The legacy bare-conversation global must not creep back into the proposer contract.
    expect(GEPA_PROPOSER_SYSTEM_PROMPT).not.toContain("${conversation}")
  })

  it("keeps the judge locked to the single llm() wrapper", () => {
    expect(GEPA_PROPOSER_SYSTEM_PROMPT).toContain("one llm() call")
  })
})
