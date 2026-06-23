import { seedTraceHex } from "@domain/shared/seeding"
import { demoSeedTraceSlots } from "@platform/db-clickhouse/seeding"
import { describe, expect, it } from "vitest"
import { buildTraceIdRemap } from "./demo-project-snapshot.ts"

const SOURCE_PROJECT_ID = "yvl1e78evmwfs2mosyjb08rc"
const TARGET_PROJECT_ID = "an3s1qhl5twcq2nbkajayw1u"

describe("buildTraceIdRemap", () => {
  it("maps every demo trace slot from the source project's id to the target's", () => {
    const remap = buildTraceIdRemap(SOURCE_PROJECT_ID, TARGET_PROJECT_ID)

    expect(remap.size).toEqual(demoSeedTraceSlots.length)
    for (const slot of demoSeedTraceSlots) {
      const source = seedTraceHex(SOURCE_PROJECT_ID, slot.traceKey, slot.index)
      const target = seedTraceHex(TARGET_PROJECT_ID, slot.traceKey, slot.index)
      expect(remap.get(source)).toEqual(target)
    }
  })

  it("leaves ids that aren't seeded trace slots untouched (literal session ids)", () => {
    const remap = buildTraceIdRemap(SOURCE_PROJECT_ID, TARGET_PROJECT_ID)
    expect(remap.has("session-anthropic-demo")).toBe(false)
    expect(remap.has("seed-large-conversation-1")).toBe(false)
  })

  it("is empty when source and target projects are the same", () => {
    expect(buildTraceIdRemap(SOURCE_PROJECT_ID, SOURCE_PROJECT_ID).size).toEqual(0)
  })
})
