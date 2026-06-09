import { REDIS_KEY_PREFIX } from "@platform/cache-redis"
import { describe, expect, it } from "vitest"
import { BULLMQ_PREFIX } from "./constants.ts"

describe("BULLMQ_PREFIX", () => {
  it("namespaces under the shared cache prefix", () => {
    expect(BULLMQ_PREFIX.startsWith(REDIS_KEY_PREFIX)).toBe(true)
  })

  it("keeps a {…} hash-tag so a queue's keys stay in one Redis Cluster slot", () => {
    expect(BULLMQ_PREFIX).toMatch(/\{[^}]+\}/)
  })

  it("produces no double colon once BullMQ appends its own ':' separator", () => {
    // BullMQ builds keys as `${prefix}:${queueName}:${type}` — the prefix must
    // not end in ':' or keys become `latitude::…` (the old single-prefix bug).
    expect(`${BULLMQ_PREFIX}:my-queue:wait`).not.toContain("::")
  })
})
