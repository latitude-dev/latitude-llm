import { REDACTION_ENTITIES, type RedactionEntity } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { findRedactionMatches, type RedactionMatch } from "./detectors.ts"
import { redactText } from "./redact-text.ts"

const ALL_ENTITIES: ReadonlySet<RedactionEntity> = new Set(REDACTION_ENTITIES)

const only = (...entities: RedactionEntity[]): ReadonlySet<RedactionEntity> => new Set(entities)

const byPosition = (a: RedactionMatch, b: RedactionMatch): number => a.start - b.start || b.end - a.end

/** Matched substrings for one entity, in document order. */
const found = (text: string, entity: RedactionEntity): string[] =>
  findRedactionMatches(text, only(entity))
    .filter((match) => match.entity === entity)
    .sort(byPosition)
    .map((match) => text.slice(match.start, match.end))

const detects = (text: string, entity: RedactionEntity): boolean => found(text, entity).length > 0

describe("email detector", () => {
  it.each([
    "john.doe@example.com",
    "a@b.co",
    "user+tag@sub.domain.example.org",
    "user_name@example-host.com",
    "USER@EXAMPLE.COM",
  ])("detects %s", (value) => {
    expect(found(`contact ${value} today`, "email")).toEqual([value])
  })

  it("detects an email inside a git author line", () => {
    expect(found("Author: John Doe <john@example.com>", "email")).toEqual(["john@example.com"])
  })

  it("does not swallow a trailing sentence period", () => {
    expect(found("Email john@example.com.", "email")).toEqual(["john@example.com"])
  })

  it.each([
    "@types/node",
    "@babel/core is installed",
    "run npm i @scope/pkg",
    "react@18.2.0",
    "eslint@8.0.0-alpha",
    "node@lts",
    "user@1.2.3.4",
    "foo@bar",
  ])("does not match %s", (value) => {
    expect(detects(value, "email")).toBe(false)
  })

  it("rejects the package@1.2.beta shape by requiring a letter before the TLD", () => {
    expect(detects("installed foo@1.2.beta", "email")).toBe(false)
  })

  // Regression: an RFC-complete local-part class runs the match left through the whole URL or file path.
  it.each([
    ["https://api.example.com/v1/users/john@example.com", "john@example.com"],
    ["/home/user/mail@example.com.txt", "mail@example.com.txt"],
    ["?email=john@example.com&x=1", "john@example.com"],
    ["GET /users?filter=a&email=john@example.com HTTP/1.1", "john@example.com"],
  ])("matches only the address inside %s", (text, expected) => {
    expect(found(text, "email")).toEqual([expected])
  })
})

describe("phone detector", () => {
  it.each(["+14155552671", "+442071838750", "+919876543210"])("detects E.164 %s", (value) => {
    expect(found(`call ${value} now`, "phone")).toEqual([value])
  })

  it.each(["(415) 555-2671", "415-555-2671", "415.555.2671", "415 555 2671"])("detects NANP %s", (value) => {
    expect(found(`call ${value} now`, "phone")).toEqual([value])
  })

  it.each([
    "2024-01-15",
    "2024-01-15T10:30:00Z",
    "192.168.1.100",
    "1.2.3.4",
    "10.0.0.255",
    "localhost:3000",
    "5551234567",
    "order 1234567890 shipped",
    "exit code 127",
  ])("does not match %s", (value) => {
    expect(detects(value, "phone")).toBe(false)
  })

  /**
   * NANP area and exchange codes start at 2, which is the only thing separating the 3-3-4 shape from
   * three ordinary numbers. Every vector here was a false positive on real tool output.
   */
  it.each([
    "Rows scanned per shard: 100 200 3000",
    "Grid offsets 123 456 7890 emitted",
    "Replace part 100-200-3000 with the revision",
    "counters 415 100 2671",
  ])("does not match %s because the area or exchange code is invalid", (value) => {
    expect(detects(value, "phone")).toBe(false)
  })

  it("does not match a bare ten-digit id because it is indistinguishable from a numeric key", () => {
    expect(detects('{"userId": 4155552671}', "phone")).toBe(false)
  })

  it.each([
    "Call 415-555-2671.",
    "Call 415 555 2671.",
    "Call 415-555-2671... later",
  ])("detects the number in %s despite the trailing punctuation", (text) => {
    expect(detects(text, "phone")).toBe(true)
  })
})

describe("credit_card detector", () => {
  it.each([
    "4111111111111111",
    "4111 1111 1111 1111",
    "4111-1111-1111-1111",
    "5500005555555559",
    "378282246310005",
    "6011111111111117",
  ])("detects %s", (value) => {
    expect(found(`card ${value} charged`, "credit_card")).toEqual([value])
  })

  /**
   * Every grouping a real issuer prints, in both separators. Enumerated because the
   * shapes are what the patterns encode: an earlier version covered only 4-4-4-N and
   * 4-6-5, so Diners' 4-6-4 silently stopped being detected while the compact form
   * still was. A shape absent from this list is a shape nothing is checking.
   *
   * The numbers are the card networks' published test values, which exist to be used
   * as fixtures and belong to no cardholder. A detector for card numbers cannot be
   * tested without card-shaped input.
   */
  it.each([
    ["4-4-4-4 Visa", "4111 1111 1111 1111"],
    ["4-4-4-4 Mastercard", "5500 0055 5555 5559"],
    ["4-4-4-4 Discover", "6011 1111 1111 1117"],
    ["4-4-4-1 Visa 13", "4222 2222 2222 2"],
    ["4-6-5 Amex", "3782 822463 10005"],
    ["4-6-4 Diners", "3056 930902 5904"],
  ])("detects the %s grouping", (_shape, value) => {
    expect(found(`card ${value} charged`, "credit_card")).toEqual([value])
    const dashed = value.replaceAll(" ", "-")
    expect(found(`card ${dashed} charged`, "credit_card")).toEqual([dashed])
  })

  /**
   * The 4-4-4-4-3 grouping is excluded from the table above because it legitimately
   * produces two matches: its first four groups are themselves a Luhn-valid 16-digit
   * Visa, so the 4-4-4-N pattern matches at the same offset. Leftmost-longest has to
   * pick the full number. Picking the shorter one would leave the last three digits
   * sitting next to a placeholder.
   */
  it.each([
    "4111 1111 1111 1111 110",
    "4111-1111-1111-1111-110",
  ])("redacts the whole 19-digit card in %s rather than the 16-digit card inside it", (value) => {
    expect(found(`card ${value} charged`, "credit_card")[0]).toBe(value)
    expect(redactText(`card ${value} charged`, only("credit_card")).text).toBe("card [REDACTED_CREDIT_CARD] charged")
  })

  it("does not accept a card whose groups use mixed separators", () => {
    expect(detects("card 4111 1111-1111 1111 charged", "credit_card")).toBe(false)
  })

  it("rejects a Luhn-invalid card number", () => {
    expect(detects("card 4111111111111112 charged", "credit_card")).toBe(false)
  })

  /**
   * Regression: a pattern allowing an optional separator between any two digits
   * bridges a card into the number that follows it, matches the combined run at a
   * length some issuer does permit, fails Luhn, and consumes the real card with it.
   *
   * The trailing number is what makes these reproduce. `16 + 3` digits is a valid
   * Visa length, so the bridged match looks legitimate to the length gate; a longer
   * neighbour would simply overflow and backtrack to the card.
   */
  it.each([
    "4111111111111111 123",
    "4111111111111111 123-45-6789",
    "+14155552671 4111111111111111 123-45-6789",
    "card 4111111111111111 exp 12-26",
  ])("still finds the card in %s", (text) => {
    expect(found(text, "credit_card")).toContain("4111111111111111")
  })

  it.each([
    "+14155552671 4111111111111111",
    "order 987654321 4111111111111111",
    "4111111111111111 987654321",
  ])("finds the card beside an unrelated number in %s", (text) => {
    expect(found(text, "credit_card")).toContain("4111111111111111")
  })

  it("finds both cards when two are adjacent", () => {
    expect(found("4111111111111111 5500005555555559", "credit_card")).toEqual(["4111111111111111", "5500005555555559"])
  })

  it("does not bridge a separator that is not part of the grouping", () => {
    expect(found("4111 1111 1111 1111 2222", "credit_card")).toEqual(["4111 1111 1111 1111"])
  })

  it("rejects a Luhn-valid digit run with no issuer prefix", () => {
    expect(detects("id 9999999999999995", "credit_card")).toBe(false)
  })

  // Both vectors are Luhn-valid, so only the issuer length gate can reject them.
  it.each([
    "41111111111111113",
    "411111111111116",
  ])("rejects Luhn-valid %s at a length Visa does not issue", (value) => {
    expect(detects(`id ${value}`, "credit_card")).toBe(false)
  })

  it.each([
    "1234567890123456789012",
    "timestamp 1710590400200000000",
    "3.14159265358979",
    "0.000000000000001",
  ])("does not match %s", (value) => {
    expect(detects(value, "credit_card")).toBe(false)
  })

  /**
   * A card at the end of a sentence is how a person writes one in a chat, and the trailing guard used to
   * reject it along with the decimals above. Both directions have to hold at once.
   */
  it.each([
    "My card is 4111111111111111.",
    "My card is 4111 1111 1111 1111.",
    "My Amex is 378282246310005.",
    "My card is 4111111111111111... probably",
  ])("detects the card in %s", (text) => {
    expect(detects(text, "credit_card")).toBe(true)
  })

  it("still rejects a card-length run that is the fractional part of a decimal", () => {
    expect(detects("ratio 0.4111111111111111", "credit_card")).toBe(false)
  })
})

describe("iban detector", () => {
  it.each([
    "GB82WEST12345698765432",
    "DE89370400440532013000",
    "FR1420041010050500013M02606",
  ])("detects compact %s", (value) => {
    expect(found(`iban ${value} ok`, "iban")).toEqual([value])
  })

  it("detects the four-group form", () => {
    expect(found("iban GB82 WEST 1234 5698 7654 32 ok", "iban")).toEqual(["GB82 WEST 1234 5698 7654 32"])
  })

  it("rejects a checksum-invalid candidate", () => {
    expect(detects("iban GB82WEST12345698765433 ok", "iban")).toBe(false)
  })

  it.each(["AWSACCESSKEYID123456", "CONSTANT_NAME_HERE", "ABCD1234EFGH5678IJKL"])("does not match %s", (value) => {
    expect(detects(value, "iban")).toBe(false)
  })
})

describe("us_ssn detector", () => {
  it.each(["123-45-6789", "123 45 6789"])("detects %s", (value) => {
    expect(found(`ssn ${value} ok`, "us_ssn")).toEqual([value])
  })

  it.each([
    "000-45-6789",
    "666-45-6789",
    "900-45-6789",
    "123-00-6789",
    "123-45-0000",
    "123456789",
    "2024-01-15",
    "1234-56-7890",
  ])("does not match %s", (value) => {
    expect(detects(value, "us_ssn")).toBe(false)
  })
})

describe("secret detector", () => {
  it("detects an OpenAI style key", () => {
    const key = "sk-proj-abc123DEF456ghi789JKL012mno345PQR678stu"
    expect(found(`export OPENAI_API_KEY=${key}`, "secret")).toEqual([key])
  })

  it("detects an Anthropic style key", () => {
    const key = "sk-ant-api03-abc123DEF456ghi789JKL012mno345PQR678stu"
    expect(found(`key ${key} here`, "secret")).toEqual([key])
  })

  it.each([
    "AKIAIOSFODNN7EXAMPLE",
    "ASIAIOSFODNN7EXAMPLE",
    "AIzaSyD-abc123DEF456ghi789JKL012mno345p",
    ["sk", "live", "abc123DEF456ghi789"].join("_"),
    ["xoxb", "123456789012", "abcDEF123456"].join("-"),
    "ghp_abc123DEF456ghi789JKL012mno345PQR678stu9",
    "github_pat_abc123DEF456ghi789JKL0",
  ])("detects %s", (value) => {
    expect(detects(`token ${value} end`, "secret")).toBe(true)
  })

  it("detects a JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
    expect(found(`Authorization: Bearer ${jwt}`, "secret")).toEqual([jwt])
  })

  it("detects a PEM private key block including its body", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34\nGkxFhD90vcNLYLI\n-----END RSA PRIVATE KEY-----"
    expect(found(`config:\n${pem}\ndone`, "secret")).toEqual([pem])
  })

  it("does not match sk- prefixed CSS class names", () => {
    expect(detects('<div class="sk-spinner-double-bounce-child">', "secret")).toBe(false)
  })

  it.each([
    "sk-short",
    "commit 0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
    "npm install @scope/some-really-long-package-name-here",
    "https://example.com/a/very/long/path/segment/that/goes/on",
  ])("does not match %s", (value) => {
    expect(detects(value, "secret")).toBe(false)
  })
})

describe("entities disabled by default", () => {
  it("detects ipv4 only when ip_address is enabled", () => {
    expect(detects("host 192.168.1.100 up", "ip_address")).toBe(true)
    expect(findRedactionMatches("host 192.168.1.100 up", only("email", "secret"))).toEqual([])
  })

  it.each(["from 203.0.113.42.", "from 203.0.113.42... retrying"])("detects the address in %s", (text) => {
    expect(detects(text, "ip_address")).toBe(true)
  })

  it("detects ipv6 in full and compressed forms", () => {
    expect(detects("addr 2001:0db8:85a3:0000:0000:8a2e:0370:7334 up", "ip_address")).toBe(true)
    expect(detects("addr 2001:db8::8a2e:370:7334 up", "ip_address")).toBe(true)
  })

  it("detects an ethereum address only when crypto_wallet is enabled", () => {
    const address = "0x52908400098527886E0F7030069857D2E4169EE7"
    expect(detects(`to ${address}`, "crypto_wallet")).toBe(true)
    expect(findRedactionMatches(`to ${address}`, only("secret"))).toEqual([])
  })

  it("does not treat a git sha as a wallet when crypto_wallet is off", () => {
    expect(findRedactionMatches("commit 0a1b2c3d4e5f60718293a4b5c6d7e8f901234567", ALL_ENTITIES)).toEqual([])
  })

  // A dotted quad and a four-part version string are the same string, so immunity is impossible, not missing.
  it.each([
    "upgraded to 1.2.3.4",
    "schema version 10.0.0.1",
  ])("would redact the version string in %s if ip_address were enabled", (text) => {
    expect(detects(text, "ip_address")).toBe(true)
    expect(findRedactionMatches(text, only("email", "phone", "credit_card", "iban", "us_ssn", "secret"))).toEqual([])
  })
})

describe("coding agent tool output", () => {
  const TOOL_OUTPUT = `
diff --git a/src/index.ts b/src/index.ts
index 0a1b2c3d4e5f60718293a4b5c6d7e8f901234567..f1e2d3c4b5a69788796a5b4c3d2e1f0987654321 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,4 +1,4 @@
-import { version } from "./v1.2.3.js"
+import { version } from "./v1.2.4.js"
 const PORT = 3000
 const TIMEOUT_MS = 1710590400200
 const HASH = "d41d8cd98f00b204e9800998ecf8427e"
 const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
 const BASE64 = "SGVsbG8gd29ybGQsIHRoaXMgaXMgYSB0ZXN0IHN0cmluZyE="
 // released 2024-01-15, see semver 10.0.0.1
`

  it("finds nothing with the default entity set", () => {
    const matches = findRedactionMatches(TOOL_OUTPUT, only("email", "phone", "credit_card", "iban", "us_ssn", "secret"))

    expect(matches).toEqual([])
  })

  it("still finds a real secret embedded in the same output", () => {
    const key = "sk-proj-abc123DEF456ghi789JKL012mno345PQR678stu"
    expect(found(`${TOOL_OUTPUT}\nOPENAI_API_KEY=${key}\n`, "secret")).toEqual([key])
  })
})

describe("findRedactionMatches", () => {
  it("returns nothing when no entity is enabled", () => {
    expect(findRedactionMatches("john@example.com +14155552671", new Set())).toEqual([])
  })

  it("returns matches from several entities in one pass", () => {
    const matches = findRedactionMatches("john@example.com and +14155552671", ALL_ENTITIES)
    const entities = new Set(matches.map((match) => match.entity))

    expect(entities.has("email")).toBe(true)
    expect(entities.has("phone")).toBe(true)
  })

  it("reports offsets that slice back to the matched text", () => {
    const text = "reach me at john@example.com please"
    const [match] = findRedactionMatches(text, only("email"))

    expect(match).toBeDefined()
    expect(text.slice(match?.start ?? 0, match?.end ?? 0)).toBe("john@example.com")
  })

  it("is repeatable across calls, so shared patterns keep no lastIndex state", () => {
    const text = "a@b.co c@d.co"
    const first = findRedactionMatches(text, only("email"))
    const second = findRedactionMatches(text, only("email"))

    expect(second).toEqual(first)
    expect(first).toHaveLength(2)
  })

  it("finds every occurrence, not just the first", () => {
    expect(found("a@b.co, c@d.co, e@f.co", "email")).toEqual(["a@b.co", "c@d.co", "e@f.co"])
  })
})
