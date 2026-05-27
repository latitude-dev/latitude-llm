/** Public marketing-site changelog page — the only navigable target. */
export const FULL_CHANGELOG_URL = "https://latitude.so/changelog"

/** Global (non-org-scoped) cache key for the rendered changelog list. */
export const CHANGELOG_CACHE_KEY = "changelog:framer:entries:v1"

/** Cache TTL — entries change at most a few times per week. */
export const CHANGELOG_CACHE_TTL_SECONDS = 600

/** Default number of entries surfaced in the in-app popover. */
export const CHANGELOG_DEFAULT_LIMIT = 5
