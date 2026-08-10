import { beforeEach, describe, expect, it, vi } from "vitest"

const { setAttributes, setStatus, end, startSpan, recordSpanExceptionForDatadog, loggerError } = vi.hoisted(() => {
  const setAttributes = vi.fn()
  const recordException = vi.fn()
  const setStatus = vi.fn()
  const end = vi.fn()
  return {
    setAttributes,
    setStatus,
    end,
    startSpan: vi.fn(() => ({ setAttributes, recordException, setStatus, end })),
    recordSpanExceptionForDatadog: vi.fn(),
    loggerError: vi.fn(),
  }
})

vi.mock("@repo/observability", () => ({
  createLogger: () => ({ error: loggerError }),
  trace: { getTracer: () => ({ startSpan }) },
  recordSpanExceptionForDatadog,
  SpanStatusCode: { ERROR: 2 },
}))

const { reportUnknownCallingCode, resetUnknownCallingCodeThrottle, MAX_TRACKED_PREFIXES } = await import(
  "./unknown-calling-code-report.ts"
)

const attributesOf = (call: number) => setAttributes.mock.calls[call]?.[0] as Record<string, unknown>

describe("reportUnknownCallingCode", () => {
  beforeEach(() => {
    resetUnknownCallingCodeThrottle()
    vi.clearAllMocks()
  })

  it("records an error span carrying the prefix and length", () => {
    reportUnknownCallingCode("+99912345678")

    expect(startSpan).toHaveBeenCalledWith("phone.unknown_calling_code")
    expect(attributesOf(0)).toEqual({ "phone.candidate_prefix": "999", "phone.digit_count": 11 })
    expect(recordSpanExceptionForDatadog).toHaveBeenCalledOnce()
    expect(setStatus).toHaveBeenCalledWith({ code: 2, message: expect.stringContaining("no known calling code") })
    expect(end).toHaveBeenCalledOnce()
  })

  it("groups every occurrence under one issue by keeping the message constant", () => {
    reportUnknownCallingCode("+99912345678")
    resetUnknownCallingCodeThrottle()
    reportUnknownCallingCode("+99887654321")

    const [firstError] = recordSpanExceptionForDatadog.mock.calls[0]?.slice(1) as [Error]
    const [secondError] = recordSpanExceptionForDatadog.mock.calls[1]?.slice(1) as [Error]
    expect(firstError.name).toBe("UnknownCallingCodeError")
    expect(secondError.name).toBe("UnknownCallingCodeError")
    expect(firstError.message).toBe(secondError.message)
  })

  it("never sends the phone number itself", () => {
    const phoneNumber = "+99912345678"
    reportUnknownCallingCode(phoneNumber)

    const serialized = JSON.stringify([
      setAttributes.mock.calls,
      loggerError.mock.calls,
      recordSpanExceptionForDatadog.mock.calls.map(([, error]) => (error as Error).message),
    ])
    expect(serialized).not.toContain("12345678")
    expect(serialized).not.toContain(phoneNumber)
  })

  it("reports a prefix once per window, however often it is submitted", () => {
    for (let attempt = 0; attempt < 5; attempt++) reportUnknownCallingCode("+99912345678")

    expect(startSpan).toHaveBeenCalledOnce()
  })

  it("throttles per prefix, so a different prefix still reports", () => {
    reportUnknownCallingCode("+99912345678")
    reportUnknownCallingCode("+99812345678")

    expect(startSpan).toHaveBeenCalledTimes(2)
  })

  it("bounds the throttle map so unbounded prefixes cannot leak memory", () => {
    for (let index = 0; index < MAX_TRACKED_PREFIXES + 50; index++) {
      reportUnknownCallingCode(`+${String(index).padStart(3, "0")}12345678`)
    }

    // Re-reporting the most recent prefix must still be throttled, proving eviction kept live claims.
    const calls = startSpan.mock.calls.length
    reportUnknownCallingCode(`+${String(MAX_TRACKED_PREFIXES + 49).padStart(3, "0")}12345678`)
    expect(startSpan).toHaveBeenCalledTimes(calls)
  })

  it("ignores a value with no digits at all", () => {
    reportUnknownCallingCode("+")

    expect(startSpan).not.toHaveBeenCalled()
  })
})
