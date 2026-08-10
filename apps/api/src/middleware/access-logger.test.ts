import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { accessLogger } from "./access-logger.ts"

const createApp = () => {
  const logs: string[] = []
  const app = new Hono()
  app.use(accessLogger((message) => logs.push(message)))

  return { app, logs }
}

describe("accessLogger", () => {
  it("suppresses successful GET /health logs", async () => {
    const { app, logs } = createApp()
    app.get("/health", (c) => c.json({ status: "ok" }))

    await app.request("/health")

    expect(logs).toEqual([])
  })

  it("logs failed GET /health requests", async () => {
    const { app, logs } = createApp()
    app.get("/health", (c) => c.json({ status: "starting" }, 503))

    await app.request("/health")

    expect(logs).toHaveLength(2)
    expect(logs[0]).toBe("<-- GET /health")
    expect(logs[1]).toContain("--> GET /health")
    expect(logs[1]).toContain("503")
    expect(logs[1]).toMatch(/\d+ms$/)
  })

  it("logs requests other than GET /health", async () => {
    const { app, logs } = createApp()
    app.get("/status", (c) => c.json({ status: "ok" }))

    await app.request("/status")

    expect(logs).toHaveLength(2)
    expect(logs[0]).toBe("<-- GET /status")
    expect(logs[1]).toContain("--> GET /status")
    expect(logs[1]).toContain("200")
    expect(logs[1]).toMatch(/\d+ms$/)
  })
})
