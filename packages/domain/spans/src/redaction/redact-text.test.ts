import { DEFAULT_REDACTION_ENTITIES, REDACTION_ENTITIES, type RedactionEntity } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  countRedactions,
  mergeRedactionCounts,
  type RedactionCounts,
  redactText,
  totalRedactionCount,
} from "./redact-text.ts"

const DEFAULTS: ReadonlySet<RedactionEntity> = new Set(DEFAULT_REDACTION_ENTITIES)
const ALL: ReadonlySet<RedactionEntity> = new Set(REDACTION_ENTITIES)

describe("redactText", () => {
  it("replaces a match with its entity placeholder", () => {
    expect(redactText("email john@example.com now", DEFAULTS).text).toBe("email [REDACTED_EMAIL] now")
  })

  it("replaces every occurrence", () => {
    expect(redactText("a@b.co and c@d.co", DEFAULTS).text).toBe("[REDACTED_EMAIL] and [REDACTED_EMAIL]")
  })

  it("replaces matches of different entities in one pass", () => {
    const result = redactText("mail john@example.com or call +14155552671", DEFAULTS)

    expect(result.text).toBe("mail [REDACTED_EMAIL] or call [REDACTED_PHONE]")
    expect(result.counts).toEqual({ email: 1, phone: 1 })
  })

  it("returns the input unchanged when nothing matches", () => {
    const text = "nothing sensitive here"

    expect(redactText(text, DEFAULTS)).toEqual({ text, counts: {} })
  })

  it("returns the input unchanged when no entity is enabled", () => {
    const text = "john@example.com"

    expect(redactText(text, new Set())).toEqual({ text, counts: {} })
  })

  it("handles an empty string", () => {
    expect(redactText("", DEFAULTS)).toEqual({ text: "", counts: {} })
  })

  it("handles a match at offset zero", () => {
    expect(redactText("john@example.com trails", DEFAULTS).text).toBe("[REDACTED_EMAIL] trails")
  })

  it("handles a match at end of string", () => {
    expect(redactText("leads john@example.com", DEFAULTS).text).toBe("leads [REDACTED_EMAIL]")
  })

  it("handles a match that spans the whole string", () => {
    expect(redactText("john@example.com", DEFAULTS).text).toBe("[REDACTED_EMAIL]")
  })

  it("handles adjacent matches with no separator between them", () => {
    const result = redactText("+14155552671 +442071838750", DEFAULTS)

    expect(result.text).toBe("[REDACTED_PHONE] [REDACTED_PHONE]")
    expect(result.counts).toEqual({ phone: 2 })
  })

  it("preserves surrounding text exactly, including newlines", () => {
    const result = redactText("line one\njohn@example.com\nline three", DEFAULTS)

    expect(result.text).toBe("line one\n[REDACTED_EMAIL]\nline three")
  })

  it("is idempotent: redacting a redacted string changes nothing further", () => {
    const once = redactText("mail john@example.com now", DEFAULTS).text
    const twice = redactText(once, DEFAULTS)

    expect(twice.text).toBe(once)
    expect(twice.counts).toEqual({})
  })

  it("is deterministic, so identical inputs hash identically downstream", () => {
    const text = "john@example.com and 4111111111111111"

    expect(redactText(text, DEFAULTS).text).toBe(redactText(text, DEFAULTS).text)
  })
})

describe("overlap resolution", () => {
  // Both vectors produce two genuinely overlapping raw matches that start at the
  // same offset, so only the longest-wins rule can decide the output.
  const PHONE_IN_EMAIL = "+14155552671@example.com"
  const GOOGLE_KEY_IN_EMAIL = "AIzaSyD-abc123DEF456ghi789JKL012mno345p@example.com"

  it("prefers the longer email over the phone number contained in its local part", () => {
    const result = redactText(PHONE_IN_EMAIL, ALL)

    expect(result.text).toBe("[REDACTED_EMAIL]")
    expect(result.counts).toEqual({ email: 1 })
  })

  it("prefers the longer email over the API key contained in its local part", () => {
    const result = redactText(GOOGLE_KEY_IN_EMAIL, ALL)

    expect(result.text).toBe("[REDACTED_EMAIL]")
    expect(result.counts).toEqual({ email: 1 })
  })

  it("emits exactly one placeholder per overlapping region, never a nested one", () => {
    for (const text of [PHONE_IN_EMAIL, GOOGLE_KEY_IN_EMAIL]) {
      expect(totalRedactionCount(redactText(text, ALL).counts)).toBe(1)
      expect(redactText(text, ALL).text.match(/\[REDACTED_/g)).toHaveLength(1)
    }
  })

  it("counts overlapping candidates once, so dry run reports what enforce would do", () => {
    for (const text of [PHONE_IN_EMAIL, GOOGLE_KEY_IN_EMAIL]) {
      expect(countRedactions(text, ALL)).toEqual(redactText(text, ALL).counts)
    }
  })

  it("emits a single placeholder for a whole JWT rather than one per dot-separated segment", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
    const result = redactText(`Bearer ${jwt}`, ALL)

    expect(result.text).toBe("Bearer [REDACTED_SECRET]")
    expect(result.counts).toEqual({ secret: 1 })
  })

  it("keeps both matches when regions only touch and do not overlap", () => {
    const result = redactText("a@b.co,c@d.co", DEFAULTS)

    expect(result.text).toBe("[REDACTED_EMAIL],[REDACTED_EMAIL]")
    expect(result.counts).toEqual({ email: 2 })
  })
})

describe("countRedactions", () => {
  it("reports counts without touching the text", () => {
    expect(countRedactions("a@b.co and c@d.co", DEFAULTS)).toEqual({ email: 2 })
  })

  it("agrees with redactText on every count", () => {
    const text = "john@example.com +14155552671 4111111111111111 123-45-6789 GB82WEST12345698765432"

    expect(countRedactions(text, DEFAULTS)).toEqual(redactText(text, DEFAULTS).counts)
  })

  it("returns an empty object for empty input", () => {
    expect(countRedactions("", DEFAULTS)).toEqual({})
    expect(countRedactions("clean", DEFAULTS)).toEqual({})
  })

  it("omits entities with no matches rather than reporting zero", () => {
    expect(countRedactions("a@b.co", DEFAULTS)).toEqual({ email: 1 })
  })
})

describe("mergeRedactionCounts", () => {
  it("adds source counts into the target in place", () => {
    const target: RedactionCounts = { email: 2 }
    mergeRedactionCounts(target, { email: 1, secret: 3 })

    expect(target).toEqual({ email: 3, secret: 3 })
  })

  it("is a no-op for an empty source", () => {
    const target: RedactionCounts = { email: 1 }
    mergeRedactionCounts(target, {})

    expect(target).toEqual({ email: 1 })
  })

  it("populates an empty target", () => {
    const target: RedactionCounts = {}
    mergeRedactionCounts(target, { phone: 2 })

    expect(target).toEqual({ phone: 2 })
  })
})

describe("redactText on match-dense text", () => {
  it("replaces every match in a densely packed leaf", () => {
    const addresses = Array.from({ length: 2_000 }, (_, index) => `user${index}@example.com`)
    const result = redactText(addresses.join(" "), DEFAULTS)

    expect(result.counts).toEqual({ email: 2_000 })
    expect(result.text).toBe(Array.from({ length: 2_000 }, () => "[REDACTED_EMAIL]").join(" "))
  })

  it("keeps the text around a match at both ends", () => {
    expect(redactText("a@b.co middle c@d.co", DEFAULTS).text).toBe("[REDACTED_EMAIL] middle [REDACTED_EMAIL]")
  })
})

describe("totalRedactionCount", () => {
  it("sums across entities", () => {
    expect(totalRedactionCount({ email: 2, secret: 3 })).toBe(5)
  })

  it("is zero for no counts", () => {
    expect(totalRedactionCount({})).toBe(0)
  })
})
