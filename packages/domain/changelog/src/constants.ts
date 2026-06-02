/** Public marketing-site changelog page — the only navigable target. */
export const FULL_CHANGELOG_URL = "https://latitude.so/changelog"

/** Global (non-org-scoped) cache key for the rendered changelog list. */
export const CHANGELOG_CACHE_KEY = "changelog:framer:entries:v3"

/** Cache TTL — keep the Framer fetch bounded while surfacing updates within 30 minutes. */
export const CHANGELOG_CACHE_TTL_SECONDS = 30 * 60

/** Default number of entries surfaced in the in-app popover. */
export const CHANGELOG_DEFAULT_LIMIT = 5
