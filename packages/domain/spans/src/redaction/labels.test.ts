import { REDACTION_ENTITIES } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  OVERSIZED_FIELD_PLACEHOLDER,
  REDACTED_IDENTITY_PLACEHOLDER,
  REDACTION_BATCH_TIMEOUT_MS,
  REDACTION_MAX_FIELD_CHARS,
  REDACTION_SKIP_KEYS,
  redactionPlaceholder,
} from "./labels.ts"

describe("redactionPlaceholder", () => {
  it.each(REDACTION_ENTITIES)("produces a bracketed uppercase placeholder for %s", (entity) => {
    expect(redactionPlaceholder(entity)).toMatch(/^\[REDACTED_[A-Z_]+\]$/)
  })

  it("uses the documented label for each entity", () => {
    expect(redactionPlaceholder("email")).toBe("[REDACTED_EMAIL]")
    expect(redactionPlaceholder("credit_card")).toBe("[REDACTED_CREDIT_CARD]")
    expect(redactionPlaceholder("us_ssn")).toBe("[REDACTED_US_SSN]")
  })

  it("gives every entity a distinct placeholder", () => {
    const placeholders = new Set(REDACTION_ENTITIES.map(redactionPlaceholder))

    expect(placeholders.size).toBe(REDACTION_ENTITIES.length)
  })

  it("never emits a placeholder that its own detectors would match again", () => {
    for (const entity of REDACTION_ENTITIES) {
      expect(redactionPlaceholder(entity)).not.toMatch(/[@+]/)
    }
  })
})

describe("redaction constants", () => {
  it("keeps the special placeholders distinct from entity placeholders", () => {
    const entityPlaceholders = new Set(REDACTION_ENTITIES.map(redactionPlaceholder))

    expect(entityPlaceholders.has(OVERSIZED_FIELD_PLACEHOLDER)).toBe(false)
    expect(entityPlaceholders.has(REDACTED_IDENTITY_PLACEHOLDER)).toBe(false)
    expect(OVERSIZED_FIELD_PLACEHOLDER).not.toBe(REDACTED_IDENTITY_PLACEHOLDER)
  })

  it("caps leaf size generously enough that only outsized payloads trip it", () => {
    expect(REDACTION_MAX_FIELD_CHARS).toBe(1_000_000)
  })

  it("allows a batch far longer than a synchronous export path would", () => {
    expect(REDACTION_BATCH_TIMEOUT_MS).toBeGreaterThan(1_000)
  })

  it("skips structural keys in both snake and camel spellings", () => {
    for (const key of ["tool_call_id", "toolCallId", "tool_use_id", "toolUseId", "mime_type", "mimeType"]) {
      expect(REDACTION_SKIP_KEYS.has(key)).toBe(true)
    }
  })

  it("does not skip keys whose values are customer text", () => {
    for (const key of ["content", "text", "name", "arguments", "response", "uri", "description"]) {
      expect(REDACTION_SKIP_KEYS.has(key)).toBe(false)
    }
  })
})
