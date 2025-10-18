import { getOrSet } from '../../../../cache'
import { env } from '@latitude-data/env'
import { App, AppDto, LightAppDto } from '../../../../constants'

const CACHE_KEY_PREFIX = 'pipedream:apps'
const ONE_DAY_IN_SECONDS = 86400

export type CachedAppsResponse = {
  apps: App[]
  totalCount: number
  cursor: string
}

/**
 * Caches the first page of Pipedream apps for 1 day.
 * Only caches when no query or cursor is provided (first page).
 * Cache is disabled in test environment to avoid test interference.
 *
 * @param query - Search query for apps
 * @param cursor - Pagination cursor
 * @param fetchApps - Function to fetch apps from Pipedream API
 * @returns Promise with apps response
 */
export async function getCachedApps({
  query,
  cursor,
  fetchApps,
}: {
  query?: string
  cursor?: string
  fetchApps: () => Promise<CachedAppsResponse>
}): Promise<CachedAppsResponse> {
  // Only cache the first page (no query, no cursor)
  // Explicitly check for truthy values to handle empty strings
  const shouldCache = !query && (!cursor || cursor.length === 0)

  if (!shouldCache) {
    return fetchApps()
  }

  // Include environment in cache key to prevent cross-environment pollution
  const environment = env.NODE_ENV || 'production'
  const cacheKey = `${CACHE_KEY_PREFIX}:${environment}:first-page`

  return getOrSet<CachedAppsResponse>(cacheKey, fetchApps, ONE_DAY_IN_SECONDS)
}

export type CachedAppResponse<C extends boolean> = C extends true
  ? AppDto
  : C extends false
    ? LightAppDto
    : never

/**
 * Caches a single Pipedream app by nameSlug for 1 day.
 * Cache is disabled in test environment to avoid test interference.
 * Cache key is scoped by environment, nameSlug, and withConfig flag.
 *
 * @param nameSlug - The nameSlug of the app to cache
 * @param withConfig - Whether to include configurableProps in the response
 * @param fetchApp - Function to fetch the app from Pipedream API
 * @returns Promise with the app data (AppDto or LightAppDto)
 */
export async function getCachedApp<C extends boolean>({
  nameSlug,
  withConfig,
  fetchApp,
}: {
  nameSlug: string
  withConfig: C
  fetchApp: () => Promise<CachedAppResponse<C>>
}): Promise<CachedAppResponse<C>> {
  // Include environment, nameSlug, and withConfig in cache key to prevent pollution
  const environment = env.NODE_ENV || 'production'
  const configSuffix = withConfig ? 'with-config' : 'slim'
  const cacheKey = `${CACHE_KEY_PREFIX}:${environment}:app:${nameSlug}:${configSuffix}`

  return getOrSet<CachedAppResponse<C>>(cacheKey, fetchApp, ONE_DAY_IN_SECONDS)
}
