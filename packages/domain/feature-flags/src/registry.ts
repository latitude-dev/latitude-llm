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
  "wrapped-merch-promo": {
    emoji: "👕",
    name: "Wrapped merch promo",
    description: "Shows the 41st.latitude.so 'share on X for free merch' banner inside the weekly Wrapped email.",
  },
  monitors: {
    emoji: "📡",
    name: "Monitors",
    description:
      "Unified alerting surface (per-monitor lifecycle, with notification delivery routed through the existing org/project notification settings).",
  },
  behaviours: {
    emoji: "🏷️",
    name: "Behaviours",
    description: "Enables the live taxonomy behaviours page for clustered user and agent interaction patterns.",
  },
  sso: {
    emoji: "🔐",
    name: "Enterprise SSO",
    description:
      "Lets org owners/admins configure SAML or OIDC single sign-on and (optionally) enforce it for their verified email domain.",
  },
  sandbox: {
    emoji: "🧪",
    name: "Test Mode sandbox",
    description: "Enables the Live ⇄ Sandbox switcher and the sandbox namespace for isolated development traces.",
  },
  tools: {
    emoji: "🔧",
    name: "Tools dashboard",
    description:
      "Project-level analytics for LLM tools: every defined and called tool with usage, failure and latency metrics.",
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
