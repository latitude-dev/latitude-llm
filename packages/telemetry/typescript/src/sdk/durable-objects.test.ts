import { describe, expect, it, vi } from "vitest"
import { createDurableObjectTelemetry } from "./durable-objects.ts"

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("createDurableObjectTelemetry", () => {
  it("flushes after the work resolves", async () => {
    const order: string[] = []
    const latitude = {
      flush: async () => {
        order.push("flush")
      },
    }
    const telemetry = createDurableObjectTelemetry({ latitude })

    const result = await telemetry.run(async () => {
      order.push("work")
      return "done"
    })

    expect(result).toBe("done")
    expect(order).toEqual(["work", "flush"])
  })

  it("flushes and rethrows when the work fails", async () => {
    const flush = vi.fn(async () => {})
    const telemetry = createDurableObjectTelemetry({ latitude: { flush } })

    await expect(
      telemetry.run(async () => {
        throw new Error("turn failed")
      }),
    ).rejects.toThrow("turn failed")
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("collapses callers that arrive while a flush is queued onto one export", async () => {
    const flush = vi.fn(async () => {})
    const telemetry = createDurableObjectTelemetry({ latitude: { flush } })

    await Promise.all([telemetry.flush(), telemetry.flush(), telemetry.flush()])

    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("gives a caller that arrives mid-export a later one", async () => {
    const gate = deferred()
    const flush = vi.fn(() => gate.promise)
    const telemetry = createDurableObjectTelemetry({ latitude: { flush } })

    const first = telemetry.flush()
    await Promise.resolve()
    // This caller's spans ended after the in-flight export started, so sharing it would drop them.
    const second = telemetry.flush()
    gate.resolve()
    await Promise.all([first, second])

    expect(flush).toHaveBeenCalledTimes(2)
  })

  it("never runs two exports at once", async () => {
    let active = 0
    let peak = 0
    const telemetry = createDurableObjectTelemetry({
      latitude: {
        flush: async () => {
          active += 1
          peak = Math.max(peak, active)
          await Promise.resolve()
          active -= 1
        },
      },
    })

    const flushes = Array.from({ length: 5 }, async () => {
      await telemetry.flush()
    })
    await Promise.all(flushes)

    expect(peak).toBe(1)
  })

  it("reports an export failure instead of failing the work being traced", async () => {
    const onError = vi.fn()
    const error = new Error("exporter unreachable")
    const telemetry = createDurableObjectTelemetry({
      latitude: { flush: async () => Promise.reject(error) },
      onError,
    })

    await expect(telemetry.run(async () => "done")).resolves.toBe("done")
    expect(onError).toHaveBeenCalledWith(error)
  })

  it("keeps flushing after a failed export", async () => {
    const flush = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("exporter unreachable"))
      .mockResolvedValue(undefined)
    const telemetry = createDurableObjectTelemetry({ latitude: { flush }, onError: () => {} })

    await telemetry.flush()
    await telemetry.flush()

    expect(flush).toHaveBeenCalledTimes(2)
  })

  it("hands the export to waitUntil so the runtime waits for it", async () => {
    const pending: Promise<unknown>[] = []
    const flush = vi.fn(async () => {})
    const telemetry = createDurableObjectTelemetry({
      latitude: { flush },
      ctx: { waitUntil: (promise) => pending.push(promise) },
    })

    telemetry.flushSoon()
    await Promise.all(pending)

    expect(pending).toHaveLength(1)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("still exports when waitUntil rejects the registration", async () => {
    const flush = vi.fn(async () => {})
    const telemetry = createDurableObjectTelemetry({
      latitude: { flush },
      ctx: {
        waitUntil: () => {
          throw new Error("Cannot perform I/O on behalf of a different request")
        },
      },
    })

    await telemetry.flush()

    expect(flush).toHaveBeenCalledTimes(1)
  })
})
