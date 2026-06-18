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
  "evaluation-sandbox-runtime": {
    emoji: "🧰",
    name: "Sandboxed evaluation runtime",
    description:
      "Executes evaluation scripts in the QuickJS sandbox runtime (full script execution) instead of the template-extraction MVP bridge.",
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
