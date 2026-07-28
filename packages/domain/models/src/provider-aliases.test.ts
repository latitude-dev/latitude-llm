import { describe, expect, it } from "vitest"
import { PROVIDER_ALIASES, resolveProviderName } from "./provider-aliases.ts"
import { getModelsForProvider } from "./registry.ts"

/**
 * This map feeds `getCostSpec`, so a target that is not a real models.dev provider id makes every
 * lookup for that provider fall through to "no pricing" — silently for span cost, and onto
 * flat-rate billing in `@platform/ai`'s metering. Nothing else catches drift in the bundled data.
 */
describe("PROVIDER_ALIASES drift guard", () => {
  it.each(Object.entries(PROVIDER_ALIASES))("%s resolves to a provider models.dev prices: %s", (_alias, target) => {
    expect(getModelsForProvider(target)).not.toHaveLength(0)
  })

  // `anthropic-vertex` was the target here and does not exist; only `google-vertex-anthropic` does.
  it("prices anthropic_vertex through resolveProviderName", () => {
    expect(resolveProviderName("anthropic_vertex")).toBe("google-vertex-anthropic")
    expect(getModelsForProvider("anthropic_vertex")).not.toHaveLength(0)
  })
})
