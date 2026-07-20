import { AI_GENERATE_TELEMETRY_TAGS } from "@domain/ai"
import { describe, expect, it } from "vitest"
import {
  embedsTaxonomyConversationSamples,
  isUserCentricFlaggerStrategy,
  shouldSkipUserCentricFlaggerForEmbeddedSamples,
} from "./embedded-samples.ts"
import { frustrationStrategy, refusalStrategy } from "./flagger-strategies/index.ts"

describe("embedsTaxonomyConversationSamples", () => {
  it("is true for taxonomy naming telemetry tags", () => {
    expect(embedsTaxonomyConversationSamples([...AI_GENERATE_TELEMETRY_TAGS.taxonomyNameCluster])).toBe(true)
    expect(embedsTaxonomyConversationSamples([...AI_GENERATE_TELEMETRY_TAGS.taxonomyProposeThemes])).toBe(true)
  })

  it("is false for unrelated tags", () => {
    expect(embedsTaxonomyConversationSamples([...AI_GENERATE_TELEMETRY_TAGS.flaggerClassify])).toBe(false)
    expect(embedsTaxonomyConversationSamples([])).toBe(false)
  })
})

describe("shouldSkipUserCentricFlaggerForEmbeddedSamples", () => {
  it("skips frustration on taxonomy name-cluster sessions", () => {
    expect(
      shouldSkipUserCentricFlaggerForEmbeddedSamples(frustrationStrategy, [
        ...AI_GENERATE_TELEMETRY_TAGS.taxonomyNameCluster,
      ]),
    ).toBe(true)
  })

  it("does not skip assistant-centric strategies on taxonomy sessions", () => {
    expect(isUserCentricFlaggerStrategy(refusalStrategy)).toBe(false)
    expect(
      shouldSkipUserCentricFlaggerForEmbeddedSamples(refusalStrategy, [
        ...AI_GENERATE_TELEMETRY_TAGS.taxonomyNameCluster,
      ]),
    ).toBe(false)
  })

  it("does not skip frustration on ordinary sessions", () => {
    expect(shouldSkipUserCentricFlaggerForEmbeddedSamples(frustrationStrategy, [])).toBe(false)
  })
})
