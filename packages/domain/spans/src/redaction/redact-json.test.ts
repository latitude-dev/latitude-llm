import { DEFAULT_REDACTION_ENTITIES, type RedactionEntity } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { type JsonRedactionOptions, redactJsonString, redactJsonValue, redactStringMap } from "./redact-json.ts"

const ENTITIES: ReadonlySet<RedactionEntity> = new Set(DEFAULT_REDACTION_ENTITIES)

const ENFORCE: JsonRedactionOptions = { entities: ENTITIES, mutate: true }
const DRY_RUN: JsonRedactionOptions = { entities: ENTITIES, mutate: false }

describe("redactJsonValue", () => {
  it("redacts a string leaf", () => {
    const result = redactJsonValue({ content: "mail john@example.com" }, ENFORCE)

    expect(result.value).toEqual({ content: "mail [REDACTED_EMAIL]" })
    expect(result.counts).toEqual({ email: 1 })
  })

  it("redacts nested leaves at any depth", () => {
    const result = redactJsonValue({ a: { b: { c: ["john@example.com"] } } }, ENFORCE)

    expect(result.value).toEqual({ a: { b: { c: ["[REDACTED_EMAIL]"] } } })
  })

  it("preserves object keys even when a key looks like PII", () => {
    const result = redactJsonValue({ "john@example.com": "clean" }, ENFORCE)

    expect(Object.keys(result.value)).toEqual(["john@example.com"])
  })

  it("preserves array length and order", () => {
    const result = redactJsonValue(["a@b.co", "clean", "c@d.co", "also clean"], ENFORCE)

    expect(result.value).toEqual(["[REDACTED_EMAIL]", "clean", "[REDACTED_EMAIL]", "also clean"])
  })

  it("leaves non-string leaves untouched", () => {
    const input = { n: 42, f: 1.5, b: true, z: null, arr: [1, 2, 3] }

    expect(redactJsonValue(input, ENFORCE).value).toEqual(input)
  })

  it("returns the identical reference when nothing changed, avoiding needless copies", () => {
    const input = { a: { b: "clean" } }

    expect(redactJsonValue(input, ENFORCE).value).toBe(input)
  })

  it("returns a new object when something changed, leaving the input unmutated", () => {
    const input = { a: "john@example.com" }
    const result = redactJsonValue(input, ENFORCE)

    expect(result.value).not.toBe(input)
    expect(input.a).toBe("john@example.com")
  })

  it("does not redact values under skip keys", () => {
    const result = redactJsonValue({ tool_call_id: "a@b.co", content: "a@b.co" }, ENFORCE)

    expect(result.value).toEqual({ tool_call_id: "a@b.co", content: "[REDACTED_EMAIL]" })
    expect(result.counts).toEqual({ email: 1 })
  })

  it("skips blob parts because their content is base64 binary", () => {
    const part = { type: "blob", mimeType: "image/png", content: "aGVsbG8gam9obkBleGFtcGxlLmNvbQ==" }

    expect(redactJsonValue(part, ENFORCE).value).toEqual(part)
  })

  it("skips file parts", () => {
    const part = { type: "file", fileId: "f-1", content: "john@example.com" }

    expect(redactJsonValue(part, ENFORCE).value).toEqual(part)
  })

  it("still redacts sibling parts alongside a skipped blob", () => {
    const parts = [
      { type: "blob", content: "john@example.com" },
      { type: "text", content: "john@example.com" },
    ]
    const result = redactJsonValue(parts, ENFORCE)

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
    const result = redactJsonValue(parts, ENFORCE)

    expect(result.value).toEqual([
      { type: "tool_call", id: "call_1", name: "send_email", arguments: { to: "[REDACTED_EMAIL]" } },
      { type: "tool_call_response", id: "call_1", response: { status: "sent to [REDACTED_EMAIL]" } },
    ])
    expect(result.counts).toEqual({ email: 2 })
  })

  it("keeps the tool name intact while redacting its arguments", () => {
    const part = { type: "tool_call", name: "read_file", arguments: { path: "/tmp/a@b.co" } }
    const result = redactJsonValue(part, ENFORCE)

    expect(result.value).toEqual({ type: "tool_call", name: "read_file", arguments: { path: "/tmp/[REDACTED_EMAIL]" } })
  })

  it("redacts a participant name, which is customer text rather than structure", () => {
    const message = { role: "user", name: "john@example.com", parts: [] }

    expect(redactJsonValue(message, ENFORCE).value).toEqual({
      role: "user",
      name: "[REDACTED_EMAIL]",
      parts: [],
    })
  })

  it("walks unknown part types through the generic path", () => {
    const part = { type: "some_future_type", payload: { note: "john@example.com" } }

    expect(redactJsonValue(part, ENFORCE).value).toEqual({
      type: "some_future_type",
      payload: { note: "[REDACTED_EMAIL]" },
    })
  })

  it("walks passthrough provider metadata", () => {
    const part = { type: "text", content: "clean", _provider_metadata: { vendorNote: "john@example.com" } }

    expect(redactJsonValue(part, ENFORCE).value).toEqual({
      type: "text",
      content: "clean",
      _provider_metadata: { vendorNote: "[REDACTED_EMAIL]" },
    })
  })

  it("aggregates counts across the whole structure", () => {
    const result = redactJsonValue({ a: "a@b.co", b: ["c@d.co", "+14155552671"] }, ENFORCE)

    expect(result.counts).toEqual({ email: 2, phone: 1 })
  })
})

describe("redactJsonValue in dry run", () => {
  it("counts without mutating", () => {
    const input = { content: "mail john@example.com" }
    const result = redactJsonValue(input, DRY_RUN)

    expect(result.value).toEqual(input)
    expect(result.counts).toEqual({ email: 1 })
  })

  it("reports the same counts that enforce would produce", () => {
    const input = { a: "a@b.co", b: { c: ["+14155552671", "4111111111111111"] } }

    expect(redactJsonValue(input, DRY_RUN).counts).toEqual(redactJsonValue(input, ENFORCE).counts)
  })

  it("does not count values it would not have redacted", () => {
    const input = { tool_call_id: "a@b.co", blob: { type: "blob", content: "a@b.co" } }

    expect(redactJsonValue(input, DRY_RUN).counts).toEqual({})
  })
})

describe("redactJsonString", () => {
  it("parses, walks, and re-serializes a JSON object", () => {
    const result = redactJsonString('{"to":"john@example.com","n":1}', ENFORCE)

    expect(JSON.parse(result.value)).toEqual({ to: "[REDACTED_EMAIL]", n: 1 })
    expect(result.counts).toEqual({ email: 1 })
  })

  it("parses, walks, and re-serializes a JSON array", () => {
    const result = redactJsonString('["john@example.com"]', ENFORCE)

    expect(JSON.parse(result.value)).toEqual(["[REDACTED_EMAIL]"])
  })

  it("preserves numbers and booleans through the round trip", () => {
    const result = redactJsonString('{"n":1.5,"b":true,"z":null,"s":"a@b.co"}', ENFORCE)

    expect(JSON.parse(result.value)).toEqual({ n: 1.5, b: true, z: null, s: "[REDACTED_EMAIL]" })
  })

  it("handles JSON nested as a string inside JSON", () => {
    const inner = JSON.stringify({ email: "john@example.com" })
    const result = redactJsonString(JSON.stringify({ payload: inner }), ENFORCE)
    const outer = JSON.parse(result.value) as { payload: string }

    expect(outer.payload).toBe('{"email":"john@example.com"}'.replace("john@example.com", "[REDACTED_EMAIL]"))
    expect(result.counts).toEqual({ email: 1 })
  })

  it("treats plain text as text", () => {
    const result = redactJsonString("contact john@example.com", ENFORCE)

    expect(result.value).toBe("contact [REDACTED_EMAIL]")
  })

  it("treats malformed JSON as text rather than dropping the field", () => {
    const result = redactJsonString('{"to":"john@example.com"', ENFORCE)

    expect(result.value).toBe('{"to":"[REDACTED_EMAIL]"')
    expect(result.counts).toEqual({ email: 1 })
  })

  it("does not re-serialize a bare JSON scalar, which would add quote escaping", () => {
    expect(redactJsonString('"john@example.com"', ENFORCE).value).toBe('"[REDACTED_EMAIL]"')
    expect(redactJsonString("42", ENFORCE).value).toBe("42")
    expect(redactJsonString("null", ENFORCE).value).toBe("null")
  })

  it("returns an empty string unchanged", () => {
    expect(redactJsonString("", ENFORCE)).toMatchObject({ value: "", counts: {} })
  })

  it("returns the input unchanged when no entity is enabled", () => {
    const text = '{"to":"john@example.com"}'

    expect(redactJsonString(text, { entities: new Set(), mutate: true })).toMatchObject({ value: text, counts: {} })
  })

  it("leaves the serialized string untouched in dry run while still counting", () => {
    const text = '{"to":"john@example.com"}'
    const result = redactJsonString(text, DRY_RUN)

    expect(result.value).toBe(text)
    expect(result.counts).toEqual({ email: 1 })
  })

  it("is idempotent", () => {
    const once = redactJsonString('{"to":"john@example.com"}', ENFORCE).value

    expect(redactJsonString(once, ENFORCE).value).toBe(once)
  })
})

describe("redactStringMap", () => {
  it("redacts values and preserves keys", () => {
    const result = redactStringMap({ "user.email": "john@example.com", env: "prod" }, ENFORCE)

    expect(result.value).toEqual({ "user.email": "[REDACTED_EMAIL]", env: "prod" })
    expect(result.counts).toEqual({ email: 1 })
  })

  it("does not apply skip keys, because attribute keys are not structural", () => {
    const result = redactStringMap({ id: "john@example.com" }, ENFORCE)

    expect(result.value).toEqual({ id: "[REDACTED_EMAIL]" })
  })

  it("counts without mutating in dry run", () => {
    const input = { a: "john@example.com" }
    const result = redactStringMap(input, DRY_RUN)

    expect(result.value).toEqual(input)
    expect(result.counts).toEqual({ email: 1 })
  })

  it("handles an empty map", () => {
    expect(redactStringMap({}, ENFORCE)).toMatchObject({ value: {}, counts: {} })
  })
})
