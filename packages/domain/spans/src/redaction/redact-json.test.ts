import { DEFAULT_REDACTION_ENTITIES, type RedactionEntity } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { OVERSIZED_FIELD_PLACEHOLDER, REDACTION_MAX_DEPTH } from "./labels.ts"
import { redactJsonString, redactJsonValue, redactStringMap } from "./redact-json.ts"

const ENTITIES: ReadonlySet<RedactionEntity> = new Set(DEFAULT_REDACTION_ENTITIES)

describe("redactJsonValue", () => {
  it("redacts a string leaf", () => {
    const result = redactJsonValue({ content: "mail john@example.com" }, ENTITIES)

    expect(result.value).toEqual({ content: "mail [REDACTED_EMAIL]" })
    expect(result.counts).toEqual({ email: 1 })
  })

  it("redacts nested leaves at any depth", () => {
    const result = redactJsonValue({ a: { b: { c: ["john@example.com"] } } }, ENTITIES)

    expect(result.value).toEqual({ a: { b: { c: ["[REDACTED_EMAIL]"] } } })
  })

  it("preserves object keys even when a key looks like PII", () => {
    const result = redactJsonValue({ "john@example.com": "clean" }, ENTITIES)

    expect(Object.keys(result.value)).toEqual(["john@example.com"])
  })

  it("preserves array length and order", () => {
    const result = redactJsonValue(["a@b.co", "clean", "c@d.co", "also clean"], ENTITIES)

    expect(result.value).toEqual(["[REDACTED_EMAIL]", "clean", "[REDACTED_EMAIL]", "also clean"])
  })

  it("leaves non-string leaves untouched", () => {
    const input = { n: 42, f: 1.5, b: true, z: null, arr: [1, 2, 3] }

    expect(redactJsonValue(input, ENTITIES).value).toEqual(input)
  })

  it("returns the identical reference when nothing changed, avoiding needless copies", () => {
    const input = { a: { b: "clean" } }

    expect(redactJsonValue(input, ENTITIES).value).toBe(input)
  })

  it("returns a new object when something changed, leaving the input unmutated", () => {
    const input = { a: "john@example.com" }
    const result = redactJsonValue(input, ENTITIES)

    expect(result.value).not.toBe(input)
    expect(input.a).toBe("john@example.com")
  })

  it("redacts values under structural-looking keys, which customer JSON uses for content", () => {
    const result = redactJsonValue({ id: "john@example.com", tool_call_id: "a@b.co" }, ENTITIES)

    expect(result.value).toEqual({ id: "[REDACTED_EMAIL]", tool_call_id: "[REDACTED_EMAIL]" })
    expect(result.counts).toEqual({ email: 2 })
  })

  it.each([
    "call_weather_1",
    "toolu_01A09q90qw4Lq5Bx",
    "gem_call_1",
    "018f2a1e-6c7b-7f3a-9d21-3b6a2e0c1d44",
    "tc1",
  ])("leaves the real vendor tool-call id %s alone, so tool pairing survives", (id) => {
    const parts = [
      { type: "tool_call", id, name: "get_weather", arguments: { to: "john@example.com" } },
      { type: "tool_call_response", id, response: "ok" },
    ]
    const result = redactJsonValue(parts, ENTITIES)

    expect(result.value).toEqual([
      { type: "tool_call", id, name: "get_weather", arguments: { to: "[REDACTED_EMAIL]" } },
      { type: "tool_call_response", id, response: "ok" },
    ])
  })

  it("skips blob parts because their content is base64 binary", () => {
    const part = { type: "blob", mimeType: "image/png", content: "aGVsbG8gam9obkBleGFtcGxlLmNvbQ==" }

    expect(redactJsonValue(part, ENTITIES).value).toEqual(part)
  })

  it("skips file parts", () => {
    const part = { type: "file", fileId: "f-1", content: "john@example.com" }

    expect(redactJsonValue(part, ENTITIES).value).toEqual(part)
  })

  it("still redacts sibling parts alongside a skipped blob", () => {
    const parts = [
      { type: "blob", content: "john@example.com" },
      { type: "text", content: "john@example.com" },
    ]
    const result = redactJsonValue(parts, ENTITIES)

    expect(result.value).toEqual([
      { type: "blob", content: "john@example.com" },
      { type: "text", content: "[REDACTED_EMAIL]" },
    ])
    expect(result.counts).toEqual({ email: 1 })
  })

  it("redacts tool call arguments and responses", () => {
    const parts = [
      { type: "tool_call", id: "call_1", name: "send_email", arguments: { to: "john@example.com" } },
      { type: "tool_call_response", id: "call_1", response: { status: "sent to john@example.com" } },
    ]
    const result = redactJsonValue(parts, ENTITIES)

    expect(result.value).toEqual([
      { type: "tool_call", id: "call_1", name: "send_email", arguments: { to: "[REDACTED_EMAIL]" } },
      { type: "tool_call_response", id: "call_1", response: { status: "sent to [REDACTED_EMAIL]" } },
    ])
    expect(result.counts).toEqual({ email: 2 })
  })

  it("keeps the tool name intact while redacting its arguments", () => {
    const part = { type: "tool_call", name: "read_file", arguments: { path: "/tmp/a@b.co" } }
    const result = redactJsonValue(part, ENTITIES)

    expect(result.value).toEqual({ type: "tool_call", name: "read_file", arguments: { path: "/tmp/[REDACTED_EMAIL]" } })
  })

  it("redacts a participant name, which is customer text rather than structure", () => {
    const message = { role: "user", name: "john@example.com", parts: [] }

    expect(redactJsonValue(message, ENTITIES).value).toEqual({
      role: "user",
      name: "[REDACTED_EMAIL]",
      parts: [],
    })
  })

  it("walks unknown part types through the generic path", () => {
    const part = { type: "some_future_type", payload: { note: "john@example.com" } }

    expect(redactJsonValue(part, ENTITIES).value).toEqual({
      type: "some_future_type",
      payload: { note: "[REDACTED_EMAIL]" },
    })
  })

  it("walks passthrough provider metadata", () => {
    const part = { type: "text", content: "clean", _provider_metadata: { vendorNote: "john@example.com" } }

    expect(redactJsonValue(part, ENTITIES).value).toEqual({
      type: "text",
      content: "clean",
      _provider_metadata: { vendorNote: "[REDACTED_EMAIL]" },
    })
  })

  it("aggregates counts across the whole structure", () => {
    const result = redactJsonValue({ a: "a@b.co", b: ["c@d.co", "+14155552671"] }, ENTITIES)

    expect(result.counts).toEqual({ email: 2, phone: 1 })
  })
})

describe("redactJsonValue skipped parts", () => {
  it("counts nothing for parts it never scanned", () => {
    const input = { blob: { type: "blob", content: "a@b.co" }, file: { type: "file", content: "a@b.co" } }

    expect(redactJsonValue(input, ENTITIES).counts).toEqual({})
  })
})

describe("redactJsonValue depth cap", () => {
  const nest = (depth: number, leaf: unknown): unknown => {
    let value = leaf
    for (let i = 0; i < depth; i++) value = [value]

    return value
  }

  it("survives serialized nesting deep enough to overflow a recursive walk", () => {
    const deep = `${"[".repeat(2_000)}"john@example.com"${"]".repeat(2_000)}`
    const result = redactJsonString(deep, ENTITIES)

    expect(result.value).not.toContain("john@example.com")
    expect(result.scan.oversized).toBe(1)
  })

  it("falls back to a text scan when the payload is too deep even to parse", () => {
    const deeper = `${"[".repeat(5_000)}"john@example.com"${"]".repeat(5_000)}`

    expect(redactJsonString(deeper, ENTITIES).value).not.toContain("john@example.com")
  })

  it("drops the subtree at the cap rather than leaving it unscanned", () => {
    const result = redactJsonValue(nest(REDACTION_MAX_DEPTH + 5, "john@example.com"), ENTITIES)

    expect(JSON.stringify(result.value)).not.toContain("john@example.com")
    expect(JSON.stringify(result.value)).toContain(OVERSIZED_FIELD_PLACEHOLDER)
    expect(result.scan.oversized).toBe(1)
  })

  it("walks structures just under the cap normally", () => {
    const result = redactJsonValue(nest(REDACTION_MAX_DEPTH - 1, "john@example.com"), ENTITIES)

    expect(JSON.stringify(result.value)).toContain("[REDACTED_EMAIL]")
    expect(result.scan.oversized).toBe(0)
  })
})

describe("redactJsonString", () => {
  it("parses, walks, and re-serializes a JSON object", () => {
    const result = redactJsonString('{"to":"john@example.com","n":1}', ENTITIES)

    expect(JSON.parse(result.value)).toEqual({ to: "[REDACTED_EMAIL]", n: 1 })
    expect(result.counts).toEqual({ email: 1 })
  })

  it("parses, walks, and re-serializes a JSON array", () => {
    const result = redactJsonString('["john@example.com"]', ENTITIES)

    expect(JSON.parse(result.value)).toEqual(["[REDACTED_EMAIL]"])
  })

  it("preserves numbers and booleans through the round trip", () => {
    const result = redactJsonString('{"n":1.5,"b":true,"z":null,"s":"a@b.co"}', ENTITIES)

    expect(JSON.parse(result.value)).toEqual({ n: 1.5, b: true, z: null, s: "[REDACTED_EMAIL]" })
  })

  it("preserves integers beyond 2^53 while redacting a sibling", () => {
    const result = redactJsonString('{"id":9007199254740993,"to":"john@example.com"}', ENTITIES)

    expect(result.value).toBe('{"id":9007199254740993,"to":"[REDACTED_EMAIL]"}')
  })

  it.each([
    ['{"n":3.14000,"to":"a@b.co"}', '{"n":3.14000,"to":"[REDACTED_EMAIL]"}'],
    ['{"n":1e2,"to":"a@b.co"}', '{"n":1e2,"to":"[REDACTED_EMAIL]"}'],
    ['{"n":-0,"to":"a@b.co"}', '{"n":-0,"to":"[REDACTED_EMAIL]"}'],
    [
      '{"n":123456789012345678901234567890,"to":"a@b.co"}',
      '{"n":123456789012345678901234567890,"to":"[REDACTED_EMAIL]"}',
    ],
  ])("preserves the number literal in %s", (input, expected) => {
    expect(redactJsonString(input, ENTITIES).value).toBe(expected)
  })

  it("does not scan the digits of a preserved number literal", () => {
    const cardShaped = '{"orderNumber":4532015112830366,"to":"john@example.com"}'
    const result = redactJsonString(cardShaped, ENTITIES)

    expect(result.value).toBe('{"orderNumber":4532015112830366,"to":"[REDACTED_EMAIL]"}')
    expect(result.counts).toEqual({ email: 1 })
  })

  it("returns the original bytes when the scan matched nothing", () => {
    const text = '{ "b" : 1,\n  "a" : "clean",  "big": 9007199254740993 }'

    expect(redactJsonString(text, ENTITIES).value).toBe(text)
  })

  it("handles JSON nested as a string inside JSON", () => {
    const inner = JSON.stringify({ email: "john@example.com" })
    const result = redactJsonString(JSON.stringify({ payload: inner }), ENTITIES)
    const outer = JSON.parse(result.value) as { payload: string }

    expect(outer.payload).toBe('{"email":"john@example.com"}'.replace("john@example.com", "[REDACTED_EMAIL]"))
    expect(result.counts).toEqual({ email: 1 })
  })

  it("treats plain text as text", () => {
    const result = redactJsonString("contact john@example.com", ENTITIES)

    expect(result.value).toBe("contact [REDACTED_EMAIL]")
  })

  it("treats malformed JSON as text rather than dropping the field", () => {
    const result = redactJsonString('{"to":"john@example.com"', ENTITIES)

    expect(result.value).toBe('{"to":"[REDACTED_EMAIL]"')
    expect(result.counts).toEqual({ email: 1 })
  })

  it("does not re-serialize a bare JSON scalar, which would add quote escaping", () => {
    expect(redactJsonString('"john@example.com"', ENTITIES).value).toBe('"[REDACTED_EMAIL]"')
    expect(redactJsonString("42", ENTITIES).value).toBe("42")
    expect(redactJsonString("null", ENTITIES).value).toBe("null")
  })

  it("returns an empty string unchanged", () => {
    expect(redactJsonString("", ENTITIES)).toMatchObject({ value: "", counts: {} })
  })

  it("returns the input unchanged when no entity is enabled", () => {
    const text = '{"to":"john@example.com"}'

    expect(redactJsonString(text, new Set())).toMatchObject({ value: text, counts: {} })
  })

  it("is idempotent", () => {
    const once = redactJsonString('{"to":"john@example.com"}', ENTITIES).value

    expect(redactJsonString(once, ENTITIES).value).toBe(once)
  })
})

describe("redactStringMap", () => {
  it("redacts values and preserves keys", () => {
    const result = redactStringMap({ "user.email": "john@example.com", env: "prod" }, ENTITIES)

    expect(result.value).toEqual({ "user.email": "[REDACTED_EMAIL]", env: "prod" })
    expect(result.counts).toEqual({ email: 1 })
  })

  it("does not apply skip keys, because attribute keys are not structural", () => {
    const result = redactStringMap({ id: "john@example.com" }, ENTITIES)

    expect(result.value).toEqual({ id: "[REDACTED_EMAIL]" })
  })

  it("handles an empty map", () => {
    expect(redactStringMap({}, ENTITIES)).toMatchObject({ value: {}, counts: {} })
  })
})
