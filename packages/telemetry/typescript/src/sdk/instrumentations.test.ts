import type { Tracer, TracerProvider } from "@opentelemetry/api"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { InstrumentationsInput } from "./instrumentations.ts"
import { normalizeAnthropic, normalizeOpenAI, registerLatitudeInstrumentations } from "./instrumentations.ts"

// Compile-time assertions that InstrumentationsInput rejects primitives and unknown keys.
// If any of these stop erroring, the input type has been loosened — fix the type, not the test.
class _FakeClass {}
const _validClass: InstrumentationsInput = { openai: _FakeClass }
const _validNamespace: InstrumentationsInput = { openai: { OpenAI: _FakeClass } }
const _validUndefined: InstrumentationsInput = { openai: undefined }
// @ts-expect-error — `true` is a primitive, not an object
const _rejectsBoolean: InstrumentationsInput = { openai: true }
// @ts-expect-error — strings are primitives
const _rejectsString: InstrumentationsInput = { openai: "openai" }
// @ts-expect-error — `nope` is not a supported integration name
const _rejectsUnknownKey: InstrumentationsInput = { nope: _FakeClass }
void [_validClass, _validNamespace, _validUndefined, _rejectsBoolean, _rejectsString, _rejectsUnknownKey]

const noopProvider: TracerProvider = { getTracer: () => ({}) as Tracer }

describe("normalizeOpenAI", () => {
  it("unwraps the OpenAI class from the package namespace", () => {
    class FakeOpenAI {}
    expect(normalizeOpenAI({ OpenAI: FakeOpenAI })).toBe(FakeOpenAI)
  })

  it("falls back to the default export when OpenAI is absent", () => {
    class FakeOpenAI {}
    expect(normalizeOpenAI({ default: FakeOpenAI })).toBe(FakeOpenAI)
  })

  it("passes through when neither field exists (user already gave the class)", () => {
    class FakeOpenAI {}
    expect(normalizeOpenAI(FakeOpenAI)).toBe(FakeOpenAI)
  })
})

describe("normalizeAnthropic", () => {
  it("passes namespace shape through unchanged", () => {
    const ns = { Anthropic: class {} }
    expect(normalizeAnthropic(ns)).toBe(ns)
  })

  it("wraps a bare class into { Anthropic } so the Traceloop patch can find it", () => {
    class FakeAnthropic {}
    expect(normalizeAnthropic(FakeAnthropic)).toEqual({ Anthropic: FakeAnthropic })
  })
})

describe("registerLatitudeInstrumentations", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it("accepts an empty object (registers nothing, does not throw)", async () => {
    await expect(
      registerLatitudeInstrumentations({
        instrumentations: {},
        tracerProvider: noopProvider,
      }),
    ).resolves.toBeUndefined()
  })

  it("throws when instrumentations is not a plain object (e.g. legacy string array)", async () => {
    await expect(
      registerLatitudeInstrumentations({
        // biome-ignore lint/suspicious/noExplicitAny: testing the runtime guard
        instrumentations: ["openai"] as any,
        tracerProvider: noopProvider,
      }),
    ).rejects.toThrow(/must be an object mapping/)
  })

  it("throws on unknown integration keys", async () => {
    await expect(
      registerLatitudeInstrumentations({
        // biome-ignore lint/suspicious/noExplicitAny: testing the runtime guard for unknown keys
        instrumentations: { nope: {} } as any,
        tracerProvider: noopProvider,
      }),
    ).rejects.toThrow(/unknown integration "nope"/)
  })

  it("ignores undefined values (lets users build the object programmatically)", async () => {
    await expect(
      registerLatitudeInstrumentations({
        instrumentations: { openai: undefined, anthropic: undefined },
        tracerProvider: noopProvider,
      }),
    ).resolves.toBeUndefined()
  })
})
