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
  "claude-code-wrapped": {
    emoji: "🎁",
    name: "Claude Code Wrapped",
    description: "Creates the weekly Wrapped for projects with Claude Code telemetry within the organization.",
  },
  "wrapped-merch-promo": {
    emoji: "👕",
    name: "Wrapped merch promo",
    description: "Shows the 41st.latitude.so 'share on X for free merch' banner inside the weekly Wrapped email.",
  },
  "email-notifications": {
    emoji: "✉️",
    name: "Email notifications",
    description: "Enables email delivery for incident notifications and the related user preferences UI.",
  },
  notifications: {
    emoji: "🔔",
    name: "In-app notifications",
    description: "Enables the in-app notifications bell and the per-project notification settings page.",
  },
  slack: {
    emoji: "💬",
    name: "Slack integration",
    description: "Enables the Slack integration settings and incident delivery to Slack.",
  },
  "timeline-incidents": {
    emoji: "📊",
    name: "Timeline incidents overlay",
    description: "Renders the incident overlay on trace and issue timeline histograms.",
  },
  monitors: {
    emoji: "📡",
    name: "Monitors",
    description:
      "Unified alerting surface (per-monitor lifecycle, with notification delivery routed through the existing org/project notification settings).",
  },
} as const satisfies Record<string, { readonly emoji: string; readonly name: string; readonly description: string }>

export type FeatureFlagId = keyof typeof FEATURE_FLAGS

export const FEATURE_FLAG_IDS = Object.keys(FEATURE_FLAGS) as readonly FeatureFlagId[]
