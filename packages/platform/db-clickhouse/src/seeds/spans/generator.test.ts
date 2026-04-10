import { SEED_API_KEY_ID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { describe, expect, it } from "vitest"
import { generateAllSpans, type TraceConfig } from "./generator.ts"
import { parseClickhouseTime } from "./span-builders.ts"

describe("generateAllSpans", () => {
  it("never generates spans beyond the configured window end", () => {
    const windowEnd = new Date("2026-04-10T10:00:00.000Z")
    const config: TraceConfig = {
      traceCount: 100,
      timeWindow: {
        from: new Date(windowEnd.getTime() - 1),
        to: windowEnd,
      },
      organizationId: SEED_ORG_ID,
      projectId: SEED_PROJECT_ID,
      apiKeyId: SEED_API_KEY_ID,
    }

    const spans = generateAllSpans(config)

    expect(spans.length).toBeGreaterThan(0)
    expect(spans.some((span) => parseClickhouseTime(span.end_time).getTime() === windowEnd.getTime())).toBe(true)

    for (const span of spans) {
      const startTime = parseClickhouseTime(span.start_time)
      const endTime = parseClickhouseTime(span.end_time)

      expect(startTime.getTime()).toBeLessThanOrEqual(windowEnd.getTime())
      expect(endTime.getTime()).toBeLessThanOrEqual(windowEnd.getTime())
      expect(endTime.getTime()).toBeGreaterThanOrEqual(startTime.getTime())
    }
  })
})
