import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import type { getClickhouseClient, getPostgresPool } from "../clients.ts"
import { registerHealthRoute } from "./health.ts"

const createFakePostgresPool = (healthy: boolean): ReturnType<typeof getPostgresPool> =>
  ({
    query: async () => {
      if (!healthy) {
        throw new Error("postgres unavailable")
      }

      return { rows: [] }
    },
    end: async () => undefined,
  }) as unknown as ReturnType<typeof getPostgresPool>

const createFakeClickhouseClient = (healthy: boolean): ReturnType<typeof getClickhouseClient> =>
  ({
    ping: async () => {
      if (!healthy) {
        throw new Error("clickhouse unavailable")
      }
    },
    close: async () => undefined,
  }) as unknown as ReturnType<typeof getClickhouseClient>

const createApp = (options: { readonly postgresHealthy: boolean; readonly clickhouseHealthy: boolean }) => {
  const app = new Hono()

  registerHealthRoute({
    app,
    postgresPool: createFakePostgresPool(options.postgresHealthy),
    clickhouseClient: createFakeClickhouseClient(options.clickhouseHealthy),
  })

  return app
}

describe("ingest health route", () => {
  it("returns ok when all dependencies are healthy", async () => {
    const app = createApp({ postgresHealthy: true, clickhouseHealthy: true })
    const response = await app.fetch(new Request("http://localhost/health"))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe("ok")
    expect(body.postgres.ok).toBe(true)
    expect(body.clickhouse.ok).toBe(true)
  })

  it("returns degraded when postgres is unhealthy", async () => {
    const app = createApp({ postgresHealthy: false, clickhouseHealthy: true })
    const response = await app.fetch(new Request("http://localhost/health"))

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.status).toBe("degraded")
    expect(body.postgres.ok).toBe(false)
    expect(body.clickhouse.ok).toBe(true)
  })

  it("returns degraded when clickhouse is unhealthy", async () => {
    const app = createApp({ postgresHealthy: true, clickhouseHealthy: false })
    const response = await app.fetch(new Request("http://localhost/health"))

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.status).toBe("degraded")
    expect(body.postgres.ok).toBe(true)
    expect(body.clickhouse.ok).toBe(false)
  })
})
