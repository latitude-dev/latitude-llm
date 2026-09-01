import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { accessLogger } from "./access-logger.ts"

const createApp = () => {
  const logs: { level: "info" | "warn"; message: string }[] = []
  const app = new Hono()
  app.use(
    accessLogger({
      info: (message) => logs.push({ level: "info", message }),
      warn: (message) => logs.push({ level: "warn", message }),
    }),
  )

  return { app, logs }
}

describe("accessLogger", () => {
  it("suppresses successful GET /health logs", async () => {
    const { app, logs } = createApp()
    app.get("/health", (c) => c.json({ status: "ok" }))

    await app.request("/health")

    expect(logs).toEqual([])
  })

  it("logs failed GET /health requests at warn", async () => {
    const { app, logs } = createApp()
    app.get("/health", (c) => c.json({ status: "starting" }, 503))

    await app.request("/health")

    expect(logs).toHaveLength(2)
    expect(logs[0]).toEqual({ level: "warn", message: "<-- GET /health" })
    expect(logs[1]?.level).toBe("warn")
    expect(logs[1]?.message).toContain("--> GET /health")
    expect(logs[1]?.message).toContain("503")
    expect(logs[1]?.message).toMatch(/\d+ms$/)
  })

  it("logs successful requests other than GET /health at info", async () => {
    const { app, logs } = createApp()
    app.get("/status", (c) => c.json({ status: "ok" }))

    await app.request("/status")

    expect(logs).toHaveLength(2)
    expect(logs[0]).toEqual({ level: "info", message: "<-- GET /status" })
    expect(logs[1]?.level).toBe("info")
    expect(logs[1]?.message).toContain("--> GET /status")
    expect(logs[1]?.message).toContain("200")
    expect(logs[1]?.message).toMatch(/\d+ms$/)
  })

  it("logs failed requests other than GET /health at warn", async () => {
    const { app, logs } = createApp()
    app.get("/status", (c) => c.json({ status: "nope" }, 500))

    await app.request("/status")

    expect(logs).toHaveLength(2)
    expect(logs[0]?.level).toBe("warn")
    expect(logs[1]?.level).toBe("warn")
    expect(logs[1]?.message).toContain("500")
  })
})
