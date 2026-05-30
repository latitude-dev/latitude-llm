import { describe, it, expect } from "vitest"
import { anySignal, getTimeoutSignal } from "./signals.js"

describe("anySignal", () => {
  it("forwards an abort from a source signal to the combined signal", () => {
    const controller = new AbortController()
    const combined = anySignal(controller.signal)

    expect(combined.aborted).toBe(false)
    controller.abort("test-reason")
    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe("test-reason")
  })

  it("immediately reflects a source signal that was already aborted before the call", () => {
    const controller = new AbortController()
    controller.abort("early")

    const combined = anySignal(controller.signal)

    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe("early")
  })

  it("detects a signal that aborts between the initial aborted check and the event listener registration", () => {
    // This reproduces a race condition: if a source signal aborts after the
    // `signal.aborted` check but before `addEventListener("abort", …)` runs,
    // the abort event is already dispatched and the listener will never fire.
    // The fix is a re-check of `signal.aborted` after adding the listener.
    const ctrlA = new AbortController()
    const ctrlB = new AbortController()

    const originalAddEventListener = ctrlA.signal.addEventListener.bind(ctrlA.signal)
    const originalRemoveEventListener = ctrlA.signal.removeEventListener.bind(ctrlA.signal)

    // Proxy that lies about `.aborted` on the first access (simulating the gap
    // between check and listener) and triggers a real abort inside
    // `addEventListener` before delegating to the native implementation.
    let abortedAccessCount = 0
    const proxy = new Proxy(ctrlA.signal, {
      get(target, prop, receiver) {
        if (prop === "aborted") {
          abortedAccessCount++
          if (abortedAccessCount === 1) return false
          return Reflect.get(target, prop, receiver)
        }
        if (prop === "addEventListener") {
          return (...args: Parameters<typeof originalAddEventListener>) => {
            if (abortedAccessCount >= 1 && args[0] === "abort") {
              ctrlA.abort("too-late")
            }
            return originalAddEventListener(...args)
          }
        }
        if (prop === "removeEventListener") {
          return originalRemoveEventListener
        }
        return Reflect.get(target, prop, receiver)
      },
    })

    const combined = anySignal(proxy, ctrlB.signal)

    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe("too-late")
  })

  it("works with getTimeoutSignal to abort after a given duration", async () => {
    const { signal, abortId } = getTimeoutSignal(100)
    const other = new AbortController()
    const combined = anySignal(signal, other.signal)

    expect(combined.aborted).toBe(false)

    await new Promise((r) => setTimeout(r, 150))
    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe("timeout")

    clearTimeout(abortId)
  })

  it("accepts a single array argument as well as spread arguments", () => {
    const a = new AbortController()
    const b = new AbortController()

    const spread = anySignal(a.signal, b.signal)
    const array = anySignal([a.signal, b.signal])

    a.abort("x")
    expect(spread.aborted).toBe(true)
    expect(array.aborted).toBe(true)
  })
})
