import { InstrumentationBase } from "@opentelemetry/instrumentation"
import { describe, expect, it, vi } from "vitest"
import { createManualInstrumentation, normalizeAnthropic, normalizeOpenAI } from "./shared.ts"

class TestInstrumentation extends InstrumentationBase {
  readonly manuallyInstrument = vi.fn()

  constructor(config: Record<string, unknown> = {}) {
    super("test", "1.0.0", config)
  }

  protected init(): [] {
    return []
  }
}

describe("createManualInstrumentation", () => {
  it("constructs and manually instruments the consumer module", () => {
    const module = { Client: class {} }
    const instrumentation = createManualInstrumentation({
      Instrumentation: TestInstrumentation,
      module,
      config: { enabled: false },
    }) as TestInstrumentation

    expect(instrumentation.manuallyInstrument).toHaveBeenCalledWith(module)
  })
})

describe("instrumentation module normalization", () => {
  it("unwraps OpenAI namespace and default exports", () => {
    class OpenAI {}
    expect(normalizeOpenAI({ OpenAI })).toBe(OpenAI)
    expect(normalizeOpenAI({ default: OpenAI })).toBe(OpenAI)
    expect(normalizeOpenAI(OpenAI)).toBe(OpenAI)
  })

  it("preserves an Anthropic namespace and wraps a bare class", () => {
    class Anthropic {}
    const namespace = { Anthropic }
    expect(normalizeAnthropic(namespace)).toBe(namespace)
    expect(normalizeAnthropic(Anthropic)).toEqual({ Anthropic })
  })
})
