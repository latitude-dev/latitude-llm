import { REDACTION_ENTITIES, REDACTION_ENTITY_LABELS, type RedactionEntity } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  OVERSIZED_FIELD_PLACEHOLDER,
  REDACTED_IDENTITY_PLACEHOLDER,
  REDACTION_BATCH_TIMEOUT_MS,
  REDACTION_MAX_FIELD_CHARS,
  redactionPlaceholder,
} from "./labels.ts"

const placeholderFor = (entity: RedactionEntity): string => redactionPlaceholder(REDACTION_ENTITY_LABELS[entity])

describe("redactionPlaceholder", () => {
  it.each(REDACTION_ENTITIES)("produces a bracketed uppercase placeholder for %s", (entity) => {
    expect(placeholderFor(entity)).toMatch(/^\[REDACTED_[A-Z_]+\]$/)
  })

  it("uses the documented label for each entity", () => {
    expect(placeholderFor("email")).toBe("[REDACTED_EMAIL]")
    expect(placeholderFor("credit_card")).toBe("[REDACTED_CREDIT_CARD]")
    expect(placeholderFor("us_ssn")).toBe("[REDACTED_US_SSN]")
  })

  it("gives every entity a distinct placeholder", () => {
    const placeholders = new Set(REDACTION_ENTITIES.map(placeholderFor))

    expect(placeholders.size).toBe(REDACTION_ENTITIES.length)
  })

  it("never emits a placeholder that its own detectors would match again", () => {
    for (const entity of REDACTION_ENTITIES) {
      expect(placeholderFor(entity)).not.toMatch(/[@+]/)
    }
  })
})

describe("redaction constants", () => {
  it("keeps the special placeholders distinct from entity placeholders", () => {
    const entityPlaceholders = new Set(REDACTION_ENTITIES.map(placeholderFor))

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
})
