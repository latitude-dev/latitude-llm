/** Public marketing-site changelog page. */
export const FULL_CHANGELOG_URL = "https://latitude.so/changelog"

/** Base URL for the marketing-site static changelog JSON API. */
export const CHANGELOG_API_BASE_URL = "https://latitude.so"

/** First page of the static changelog JSON API. */
export const CHANGELOG_API_FIRST_PAGE_PATH = "/api/changelog.json"

/** Page size enforced by the marketing-site changelog API. */
export const CHANGELOG_API_PAGE_SIZE = 50

/** Global (non-org-scoped) cache key for the rendered changelog list. */
export const CHANGELOG_CACHE_KEY = "changelog:api:entries:v1"

/** Cache TTL — pair with the API's CDN cache while bounding upstream fetches. */
export const CHANGELOG_CACHE_TTL_SECONDS = 30 * 60

/** Default number of entries surfaced in the in-app popover. */
export const CHANGELOG_DEFAULT_LIMIT = 5
