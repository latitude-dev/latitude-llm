import { getModelsForProvider, PROVIDER_ALIASES as REGISTRY_PROVIDER_ALIASES } from "@domain/models"
import { describe, expect, it } from "vitest"
import { PROVIDER_ALIASES } from "./identity.ts"

/**
 * An alias whose target is not a real models.dev provider id resolves cost to 0 without any error,
 * which is the exact failure this map exists to prevent. Nothing else catches a typo or a renamed
 * provider, so every target is checked against the bundled data.
 */
describe("PROVIDER_ALIASES drift guard", () => {
  it.each(Object.entries(PROVIDER_ALIASES))("%s resolves to a provider models.dev prices: %s", (_alias, target) => {
    expect(getModelsForProvider(target)).not.toHaveLength(0)
  })

  it("maps anthropic_vertex to the id models.dev actually uses", () => {
    expect(PROVIDER_ALIASES.anthropic_vertex).toBe("google-vertex-anthropic")
    expect(getModelsForProvider("anthropic-vertex")).toHaveLength(0)
  })

  /**
   * The registry keeps its own map for provider names that never pass through span resolution, and
   * both are valid targets on their own, so checking each in isolation cannot catch the two
   * disagreeing about a key they share — which is how `anthropic_vertex` came to mean two things.
   */
  it("agrees with the registry's alias map on every shared key", () => {
    const shared = Object.keys(REGISTRY_PROVIDER_ALIASES).filter((key) => key in PROVIDER_ALIASES)
    expect(shared.length).toBeGreaterThan(0)

    for (const key of shared) {
      expect(PROVIDER_ALIASES[key], `alias "${key}" disagrees between the span resolver and the registry`).toBe(
        REGISTRY_PROVIDER_ALIASES[key],
      )
    }
  })
})
