import { Pool } from "pg"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("createPostgresPool", () => {
  const envSnapshot = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...envSnapshot }
    delete process.env.LAT_DATABASE_URL
  })

  afterEach(() => {
    process.env = { ...envSnapshot }
    vi.resetModules()
  })

  it("does not read LAT_DATABASE_URL when the module is imported", async () => {
    await expect(import("./client.ts")).resolves.toBeDefined()
  })

  it("reads LAT_DATABASE_URL only when createPostgresPool runs", async () => {
    process.env.LAT_DATABASE_URL = "postgres://127.0.0.1:5432/latitude_test_client"
    const { createPostgresPool, closePostgres } = await import("./client.ts")
    const pool = createPostgresPool()
    expect(pool).toBeInstanceOf(Pool)
    await closePostgres(pool)
  })
})
