import { describe, expect, it } from "vitest"
import { isLiveQueue, isManualQueue, isSystemQueue, normalizeQueueSettings } from "./annotation-queue.ts"

describe("normalizeQueueSettings", () => {
  it("returns settings unchanged when filter is absent", () => {
    const settings = { sampling: 10 }
    expect(normalizeQueueSettings(settings)).toBe(settings)
  })

  it("returns settings unchanged when filter has non-empty conditions", () => {
    const settings = { filter: { status: [{ op: "eq" as const, value: "error" }] }, sampling: 25 }
    expect(normalizeQueueSettings(settings)).toBe(settings)
  })

  it("strips filter when it is an empty object", () => {
    const result = normalizeQueueSettings({ filter: {}, sampling: 10 })
    expect(result).toEqual({ sampling: 10 })
    expect(result).not.toHaveProperty("filter")
  })

  it("strips keys with empty condition arrays", () => {
    const result = normalizeQueueSettings({
      filter: { status: [], cost: [{ op: "gte" as const, value: 100 }] },
    })
    expect(result).toEqual({ filter: { cost: [{ op: "gte", value: 100 }] } })
  })

  it("strips filter entirely when all keys have empty condition arrays", () => {
    const result = normalizeQueueSettings({ filter: { status: [], cost: [] } })
    expect(result).toEqual({})
    expect(result).not.toHaveProperty("filter")
  })
})

describe("isLiveQueue / isManualQueue", () => {
  it("identifies a queue with filter as live", () => {
    const settings = { filter: { status: [{ op: "eq" as const, value: "error" }] } }
    expect(isLiveQueue(settings)).toBe(true)
    expect(isManualQueue(settings)).toBe(false)
  })

  it("identifies a queue without filter as manual", () => {
    expect(isLiveQueue({})).toBe(false)
    expect(isManualQueue({})).toBe(true)
  })

  it("identifies a queue with only sampling as manual", () => {
    expect(isLiveQueue({ sampling: 10 })).toBe(false)
    expect(isManualQueue({ sampling: 10 })).toBe(true)
  })
})

describe("isSystemQueue", () => {
  it("returns true for system queues", () => {
    expect(isSystemQueue({ system: true })).toBe(true)
  })

  it("returns false for user-created queues", () => {
    expect(isSystemQueue({ system: false })).toBe(false)
  })
})
