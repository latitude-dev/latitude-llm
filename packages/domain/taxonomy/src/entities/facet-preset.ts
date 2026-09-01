import { FACET_PRESET_SLUG_PREFIX } from "../constants.ts"

/**
 * A code-defined facet the +behavior modal offers as a one-click card. A preset is
 * NOT pre-materialized: picking one find-or-creates its `taxonomy_facets` row (by
 * the reserved `slug`) on first use, so a project only pays for the facets it
 * actually applies. `name`/`description`/`instructions` seed that row's editable
 * presentation and its write-once extraction guidance.
 */
export interface FacetPreset {
  /** Reserved slug (always `lat-` prefixed): the find-or-create key, unique per project. */
  readonly slug: string
  readonly name: string
  /** Picker blurb: why this facet is useful for your sessions. */
  readonly description: string
  /** Extraction guidance compiled into the controlled prompt (Phase 2). */
  readonly instructions: string
}

/**
 * The five presets. Each names a distinct semantic space the sessions are
 * re-embedded and clustered by, instead of the raw transcript's topic. Slugs are
 * reserved (`lat-`); user-authored facets can never claim these, so `createFacet`
 * rejects the prefix.
 */
export const FACET_PRESETS: readonly FacetPreset[] = [
  {
    slug: `${FACET_PRESET_SLUG_PREFIX}user-goal`,
    name: "User goal",
    description: "Cluster sessions by what the user was ultimately trying to accomplish, regardless of topic.",
    instructions:
      "Identify the user's apparent overall goal for the conversation: what they were ultimately trying to accomplish, not the individual steps or the surface topic. State it as a single goal in the user's own terms.",
  },
  {
    slug: `${FACET_PRESET_SLUG_PREFIX}outcome`,
    name: "Outcome",
    description: "Cluster sessions by how they ended: whether the user got what they needed.",
    instructions:
      "Identify the observable outcome of the conversation for the user: whether their goal was achieved, partially achieved, left unresolved, or abandoned. Describe what actually happened by the end, not what either party intended.",
  },
  {
    slug: `${FACET_PRESET_SLUG_PREFIX}friction-reason`,
    name: "Friction reason",
    description: "Cluster sessions by what got in the user's way, so recurring blockers surface.",
    instructions:
      "Identify the main source of friction the user hit during the conversation: the specific thing that slowed them down, confused them, or blocked progress. If the conversation went smoothly with no notable friction, treat that as unclear.",
  },
  {
    slug: `${FACET_PRESET_SLUG_PREFIX}assistant-approach`,
    name: "Assistant approach",
    description: "Cluster sessions by the strategy the assistant took to help.",
    instructions:
      "Identify the primary approach the assistant took to help the user: the strategy or method it used (for example: walked through steps, wrote code, asked clarifying questions, looked things up, delegated to a tool). Describe the dominant approach for the conversation as a whole.",
  },
  {
    slug: `${FACET_PRESET_SLUG_PREFIX}capability-gap`,
    name: "Capability gap",
    description: "Cluster sessions by what the assistant could not do, to reveal missing capabilities.",
    instructions:
      "Identify a capability the assistant lacked that would have helped the user: something it could not do, did not have access to, or was not allowed to do. If the assistant was able to fully help with no missing capability, treat that as unclear.",
  },
]

const PRESETS_BY_SLUG = new Map(FACET_PRESETS.map((preset) => [preset.slug, preset] as const))

/** Resolve a reserved preset slug to its definition, or null if it names no known preset. */
export const findFacetPreset = (slug: string): FacetPreset | null => PRESETS_BY_SLUG.get(slug) ?? null
