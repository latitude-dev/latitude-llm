/**
 * Code-defined registry of feature flags.
 *
 * Adding a flag here makes it referenceable from code immediately — the DB
 * does not need to know about it. A flag is "enabled" only when an explicit
 * row in `feature_flags` (with `enabled_for_all = true`) or
 * `organization_feature_flags` exists for it. Missing rows = disabled.
 *
 * Removing an entry here forces every call site to update via the
 * `FeatureFlagId` literal-union; leftover DB rows for a removed identifier
 * are inert and can be cleaned from the backoffice.
 */
export const FEATURE_FLAGS = {
  sso: {
    emoji: "🔐",
    name: "Enterprise SSO",
    description:
      "Lets org owners/admins configure SAML or OIDC single sign-on and (optionally) enforce it for their verified email domain.",
  },
  customBehaviors: {
    emoji: "🎛️",
    name: "Custom behaviors",
    description:
      "Project-scoped, filter-defined behavior taxonomies with their own authoring UI. Hidden until the Generate flow ships.",
  },
  adaptiveTaxonomyClustering: {
    emoji: "🌳",
    name: "Adaptive taxonomy clustering",
    description:
      "Enforces node-relative adaptive taxonomy clustering for every project in the organization, raising the environment baseline (shadow/enforced) to enforced. The env kill switch still overrides it.",
  },
} as const satisfies Record<
  string,
  {
    readonly emoji: string
    readonly name: string
    readonly description: string
  }
>

export type FeatureFlagId = keyof typeof FEATURE_FLAGS

export const FEATURE_FLAG_IDS = Object.keys(FEATURE_FLAGS) as readonly FeatureFlagId[]
