import type { ClickHouseClient } from "@clickhouse/client"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { healthcheckClickhouse } from "./health.ts"

describe("healthcheckClickhouse", () => {
  it("returns ok and latency for healthy clients", async () => {
    const client = {
      ping: vi.fn().mockResolvedValue(undefined),
    } as unknown as ClickHouseClient

    const health = await Effect.runPromise(healthcheckClickhouse(client))

    expect(health.ok).toBe(true)
    expect(health.latencyMs).toBeGreaterThanOrEqual(0)
    expect(client.ping).toHaveBeenCalledTimes(1)
  })

  it("fails when ping throws", async () => {
    const client = {
      ping: vi.fn().mockRejectedValue(new Error("unreachable")),
    } as unknown as ClickHouseClient

    await expect(Effect.runPromise(healthcheckClickhouse(client))).rejects.toThrow()
  })
})
