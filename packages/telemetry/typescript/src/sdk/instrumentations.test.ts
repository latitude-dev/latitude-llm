import type { Tracer, TracerProvider } from "@opentelemetry/api"
import type { Instrumentation } from "@opentelemetry/instrumentation"
import { describe, expect, it } from "vitest"
import type { InstrumentationsInput } from "./instrumentations.ts"
import { registerLatitudeInstrumentations } from "./instrumentations.ts"

const instrumentation = {} as Instrumentation
const _valid: InstrumentationsInput = [instrumentation]
// @ts-expect-error primitives are not instrumentations
const _rejectsPrimitive: InstrumentationsInput = ["openai"]
// @ts-expect-error object maps were removed
const _rejectsObjectMap: InstrumentationsInput = { openai: class {} }
void [_valid, _rejectsPrimitive, _rejectsObjectMap]

const noopProvider: TracerProvider = { getTracer: () => ({}) as Tracer }

describe("registerLatitudeInstrumentations", () => {
  it("accepts an empty array", () => {
    expect(() =>
      registerLatitudeInstrumentations({
        instrumentations: [],
        tracerProvider: noopProvider,
      }),
    ).not.toThrow()
  })

  it("rejects the removed object-map API with migration guidance", () => {
    expect(() =>
      registerLatitudeInstrumentations({
        // @ts-expect-error testing the runtime migration guard
        instrumentations: { openai: class {} },
        tracerProvider: noopProvider,
      }),
    ).toThrow(/must be an array.*instrumentations\/\*/)
  })

  it("rejects the removed string-array API with migration guidance", () => {
    expect(() =>
      registerLatitudeInstrumentations({
        // @ts-expect-error testing the runtime migration guard
        instrumentations: ["openai"],
        tracerProvider: noopProvider,
      }),
    ).toThrow(/must be an array.*instrumentations\/\*/)
  })
})
