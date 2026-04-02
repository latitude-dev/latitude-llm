import type { ReadableSpan } from "@opentelemetry/sdk-trace-node"
import { describe, expect, it } from "vitest"
import { SCOPE_LATITUDE } from "../constants/scope.ts"
import {
  buildShouldExportSpan,
  isDefaultExportSpan,
  isGenAiOrLlmAttributeSpan,
  isLatitudeInstrumentationSpan,
} from "./span-filter.ts"

function mockSpan(overrides: { scopeName?: string; attributes?: Record<string, unknown> }): ReadableSpan {
  const { scopeName = "", attributes = {} } = overrides
  return {
    instrumentationLibrary: { name: scopeName },
    attributes,
  } as unknown as ReadableSpan
}

describe("isLatitudeInstrumentationSpan", () => {
  it("matches manual and nested latitude scopes", () => {
    expect(isLatitudeInstrumentationSpan(mockSpan({ scopeName: `${SCOPE_LATITUDE}.manual` }))).toBe(true)
    expect(isLatitudeInstrumentationSpan(mockSpan({ scopeName: SCOPE_LATITUDE }))).toBe(true)
    expect(isLatitudeInstrumentationSpan(mockSpan({ scopeName: "express" }))).toBe(false)
  })
})

describe("isGenAiOrLlmAttributeSpan", () => {
  it("matches gen_ai and llm attribute prefixes", () => {
    expect(isGenAiOrLlmAttributeSpan(mockSpan({ attributes: { "gen_ai.request.model": "gpt-4" } }))).toBe(true)
    expect(isGenAiOrLlmAttributeSpan(mockSpan({ attributes: { "llm.model_name": "x" } }))).toBe(true)
    expect(isGenAiOrLlmAttributeSpan(mockSpan({ attributes: { "openinference.span.kind": "CHAIN" } }))).toBe(true)
    expect(isGenAiOrLlmAttributeSpan(mockSpan({ attributes: { "http.route": "/api" } }))).toBe(false)
  })
})

describe("isDefaultExportSpan", () => {
  it("rejects generic HTTP instrumentation", () => {
    expect(
      isDefaultExportSpan(
        mockSpan({
          scopeName: "opentelemetry.instrumentation.requests",
          attributes: { "http.method": "GET" },
        }),
      ),
    ).toBe(false)
  })

  it("accepts known LLM OTel scopes", () => {
    expect(isDefaultExportSpan(mockSpan({ scopeName: "opentelemetry.instrumentation.openai" }))).toBe(true)
    expect(isDefaultExportSpan(mockSpan({ scopeName: "openinference.instrumentation.langchain" }))).toBe(true)
  })

  it("accepts traceloop substring scopes", () => {
    expect(isDefaultExportSpan(mockSpan({ scopeName: "traceloop.instrumentation.openai" }))).toBe(true)
  })

  it("accepts langsmith substring scopes", () => {
    expect(isDefaultExportSpan(mockSpan({ scopeName: "my.langsmith.tracer" }))).toBe(true)
  })

  it("accepts litellm substring scopes", () => {
    expect(isDefaultExportSpan(mockSpan({ scopeName: "litellm.proxy" }))).toBe(true)
  })
})

describe("buildShouldExportSpan", () => {
  it("exports everything when smart filter disabled", () => {
    const pred = buildShouldExportSpan({ disableSmartFilter: true })
    expect(pred(mockSpan({ scopeName: "opentelemetry.instrumentation.requests" }))).toBe(true)
  })

  it("respects blocked scopes", () => {
    const pred = buildShouldExportSpan({
      blockedInstrumentationScopes: ["opentelemetry.instrumentation.openai"],
    })
    expect(pred(mockSpan({ scopeName: "opentelemetry.instrumentation.openai" }))).toBe(false)
    expect(pred(mockSpan({ scopeName: "opentelemetry.instrumentation.anthropic" }))).toBe(true)
  })

  it("composes with shouldExportSpan", () => {
    const pred = buildShouldExportSpan({
      shouldExportSpan: (s) => s.instrumentationLibrary?.name === "my.custom.scope",
    })
    expect(pred(mockSpan({ scopeName: "my.custom.scope" }))).toBe(true)
    expect(pred(mockSpan({ scopeName: "express" }))).toBe(false)
  })
})
