import { describe, expect, it } from "vitest"
import {
  DESTINATION_MAX_RECORDS_PER_RUN_DEFAULT,
  DESTINATION_MAX_RECORDS_PER_RUN_MAX,
  DESTINATION_MAX_RECORDS_PER_RUN_MIN,
} from "../constants.ts"
import { DESTINATION_KIND_META, supportedSourcesForKind } from "./destination.ts"
import { DESTINATION_SOURCES, defaultSourceConfig, destinationSourceConfigSchema } from "./destination-source.ts"

describe("destinationSourceConfigSchema", () => {
  it("applies defaults for excludePayloads and maxRecordsPerRun", () => {
    const parsed = destinationSourceConfigSchema.parse({ source: "spans" })
    expect(parsed).toMatchObject({
      source: "spans",
      excludePayloads: false,
      maxRecordsPerRun: DESTINATION_MAX_RECORDS_PER_RUN_DEFAULT,
    })
  })

  it("bounds maxRecordsPerRun to 1k–50k", () => {
    expect(
      destinationSourceConfigSchema.safeParse({
        source: "spans",
        maxRecordsPerRun: DESTINATION_MAX_RECORDS_PER_RUN_MIN - 1,
      }).success,
    ).toBe(false)
    expect(
      destinationSourceConfigSchema.safeParse({
        source: "spans",
        maxRecordsPerRun: DESTINATION_MAX_RECORDS_PER_RUN_MAX + 1,
      }).success,
    ).toBe(false)
  })
})

describe("defaultSourceConfig", () => {
  it("returns a parseable default config for every source", () => {
    for (const source of DESTINATION_SOURCES) {
      expect(defaultSourceConfig(source).source).toBe(source)
    }
  })
})

describe("supportedSourcesForKind", () => {
  it("returns at least one source for every kind, all valid sources", () => {
    for (const kind of Object.keys(DESTINATION_KIND_META) as (keyof typeof DESTINATION_KIND_META)[]) {
      const sources = supportedSourcesForKind(kind)
      expect(sources.length).toBeGreaterThan(0)
      for (const source of sources) expect(DESTINATION_SOURCES).toContain(source)
    }
  })

  it("maps posthog to spans", () => {
    expect(supportedSourcesForKind("posthog")).toEqual(["spans"])
  })
})
