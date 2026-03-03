import { describe, expect, it, vi } from "vitest"
import { createModelsDevRepository } from "./client.ts"

vi.mock("@platform/cache-redis", () => ({
  createRedisConnection: () => ({ host: "localhost", port: 6379 }),
  createRedisClient: () => ({
    getBuffer: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
  }),
}))

describe("createModelsDevRepository", () => {
  it("returns a ModelRepository with getAllModels", () => {
    const repo = createModelsDevRepository()
    expect(typeof repo.getAllModels).toBe("function")
  })

  it("getAllModels returns a non-empty model list", async () => {
    const repo = createModelsDevRepository()
    const models = await repo.getAllModels()
    expect(Array.isArray(models)).toBe(true)
    expect(models.length).toBeGreaterThan(0)
  })

  it("getAllModels returns models with expected shape", async () => {
    const repo = createModelsDevRepository()
    const models = await repo.getAllModels()
    const first = models[0]
    expect(first).toHaveProperty("id")
    expect(first).toHaveProperty("name")
    expect(first).toHaveProperty("provider")
  })

  it("caches results in-process across calls", async () => {
    const repo = createModelsDevRepository()
    const first = await repo.getAllModels()
    const second = await repo.getAllModels()
    expect(first).toBe(second)
  })
})
