import { describe, expect, it } from "vitest"
import { redactionChipExplanation, redactionChipLabel } from "./redaction-placeholders.ts"

describe("redactionChipLabel", () => {
  it("opens underscores so a label reads as words", () => {
    expect(redactionChipLabel("CREDIT_CARD")).toBe("CREDIT CARD")
    expect(redactionChipLabel("US_SSN")).toBe("US SSN")
    expect(redactionChipLabel("EMAIL")).toBe("EMAIL")
  })
})

describe("redactionChipExplanation", () => {
  it("names what was removed and that it is gone for good", () => {
    const copy = redactionChipExplanation("EMAIL")

    expect(copy).toContain("An email address")
    expect(copy).toContain("cannot be recovered")
  })

  it("picks the right article for a consonant-initial phrase", () => {
    expect(redactionChipExplanation("PHONE")).toContain("A phone number")
    expect(redactionChipExplanation("CREDIT_CARD")).toContain("A credit card number")
  })

  it("uses 'an' for a vowel-initial phrase", () => {
    expect(redactionChipExplanation("IP_ADDRESS")).toContain("An IP address")
  })

  // Nothing was detected here — the field simply exceeded the scan cap — so claiming PII
  // was found would be wrong.
  it("explains an oversized field as a size limit, not a detection", () => {
    const copy = redactionChipExplanation("OVERSIZED_FIELD")

    expect(copy).toContain("too large to scan")
    expect(copy).toContain("Nothing in it was identified as personal data")
  })

  it("explains a redacted user identifier in terms of identity handling", () => {
    const copy = redactionChipExplanation("USER")

    expect(copy).toContain("user identifier")
    expect(copy).toContain("pseudonymises or removes")
  })

  // Client-side SDK masking emits the same grammar with labels we don't define, and no
  // per-span flag says who redacted what, so the copy must not name an origin.
  it("falls back to a neutral phrase for an unknown label", () => {
    const copy = redactionChipExplanation("PASSWORD")

    expect(copy).toContain("A value was removed by PII redaction")
    expect(copy).not.toContain("undefined")
  })

  it("never claims which layer performed the redaction", () => {
    for (const label of ["EMAIL", "USER", "OVERSIZED_FIELD", "PASSWORD"]) {
      expect(redactionChipExplanation(label)).not.toContain("this project's policy")
    }
  })
})
