import { describe, expect, it } from "vitest"
import { hammingDistance64, simhash64 } from "./simhash.ts"

const LONG_PARAGRAPH_A =
  "The customer support agent handles billing questions, subscription changes, and refund requests for enterprise accounts. " +
  "It should always confirm the account owner before making changes, escalate disputes above five hundred dollars to a human reviewer, " +
  "and never share internal pricing tiers with the customer. Responses should stay professional, concise, and empathetic at all times. " +
  "When a customer asks about a refund, the agent must check the order history before approving anything. " +
  "The agent operates within a ticketing system that logs every customer interaction for compliance review by the trust and safety team. " +
  "It must route technical issues to engineering, sales questions to the account management team, and legal inquiries to the legal department. " +
  "The agent should never make promises about specific delivery dates or discounts that have not been pre-approved by a manager. " +
  "It should use a warm, respectful tone even when customers are frustrated, and it should summarize the resolution at the end of every " +
  "conversation so the customer has a clear record of what was agreed upon."

const LONG_PARAGRAPH_B = LONG_PARAGRAPH_A.replace("subscription changes", "plan changes")
  .replace("pricing tiers", "discount tiers")
  .replace("empathetic", "friendly")
  .replace("engineering", "the engineering team")

const UNRELATED_PARAGRAPH =
  "The weather forecasting model ingests satellite imagery, radar sweeps, and ocean buoy telemetry to predict storm paths. " +
  "It should flag rapidly intensifying systems, generate hourly precipitation estimates, and publish alerts for coastal regions. " +
  "Forecast confidence intervals must widen appropriately as the prediction horizon extends beyond seventy-two hours. " +
  "Analysts review every tropical cyclone advisory before it is released to the public."

describe("simhash64", () => {
  it("returns distance 0 for identical text", () => {
    const sketch = simhash64(LONG_PARAGRAPH_A)
    expect(hammingDistance64(sketch, simhash64(LONG_PARAGRAPH_A))).toBe(0)
  })

  it("returns a small distance for near-duplicate text with a few words changed", () => {
    const distance = hammingDistance64(simhash64(LONG_PARAGRAPH_A), simhash64(LONG_PARAGRAPH_B))
    expect(distance).toBeLessThanOrEqual(6)
  })

  it("returns a large distance for unrelated text", () => {
    const distance = hammingDistance64(simhash64(LONG_PARAGRAPH_A), simhash64(UNRELATED_PARAGRAPH))
    expect(distance).toBeGreaterThanOrEqual(20)
  })

  it("does not throw on an empty string", () => {
    expect(() => simhash64("")).not.toThrow()
    expect(hammingDistance64(simhash64(""), simhash64(""))).toBe(0)
  })

  it("does not throw on a single word", () => {
    expect(() => simhash64("hello")).not.toThrow()
    expect(hammingDistance64(simhash64("hello"), simhash64("hello"))).toBe(0)
  })

  it("distinguishes different single words", () => {
    expect(simhash64("hello")).not.toBe(simhash64("goodbye"))
  })
})

describe("hammingDistance64", () => {
  it("counts differing bits between two sketches", () => {
    expect(hammingDistance64(0n, 0n)).toBe(0)
    expect(hammingDistance64(0n, 1n)).toBe(1)
    expect(hammingDistance64(0n, 0b1011n)).toBe(3)
    expect(hammingDistance64(0xffffffffffffffffn, 0n)).toBe(64)
  })
})
