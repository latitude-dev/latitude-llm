import { cache } from '../../../../cache'
import { env } from '@latitude-data/env'
import { Result, TypedResult } from '../../../../lib/Result'

const CACHE_KEY_PREFIX = 'pipedream:apps'

/**
 * Invalidates the first page cache for Pipedream apps.
 * This clears the cached list of apps that is shown on initial load.
 */
export async function invalidateFirstPageCache(): Promise<
  TypedResult<{ deletedCount: number }, Error>
> {
  try {
    const cacheClient = await cache()
    const environment = env.NODE_ENV || 'production'
    const cacheKey = `${CACHE_KEY_PREFIX}:${environment}:first-page`

    const deleted = await cacheClient.del(cacheKey)

    return Result.ok({ deletedCount: deleted })
  } catch (error) {
    return Result.error(error as Error)
  }
}

/**
 * Invalidates the cache for a specific Pipedream app by nameSlug.
 * Clears both the "with-config" and "slim" versions of the cached app.
 *
 * @param nameSlug - The nameSlug of the app to invalidate (e.g., "slack", "github")
 */
export async function invalidateAppCache(
  nameSlug: string,
): Promise<TypedResult<{ deletedCount: number }, Error>> {
  try {
    const cacheClient = await cache()
    const environment = env.NODE_ENV || 'production'

    // Delete both config variants
    const withConfigKey = `${CACHE_KEY_PREFIX}:${environment}:app:${nameSlug}:with-config`
    const slimKey = `${CACHE_KEY_PREFIX}:${environment}:app:${nameSlug}:slim`

    const deleted = await cacheClient.del(withConfigKey, slimKey)

    return Result.ok({ deletedCount: deleted })
  } catch (error) {
    return Result.error(error as Error)
  }
}

/**
 * Searches for Pipedream app cache keys by pattern and returns matching keys.
 * Does not delete anything, just returns keys that match the search.
 *
 * @param searchTerm - Search term to match against app nameSlug or key pattern
 */
export async function searchAppCacheKeys(
  searchTerm: string,
): Promise<TypedResult<string[], Error>> {
  try {
    const cacheClient = await cache()
    const environment = env.NODE_ENV || 'production'

    // Get all app keys first (more reliable than wildcard search with searchTerm)
    // Use wildcard at the start to match the Redis keyPrefix (latitude:)
    const pattern = `*${CACHE_KEY_PREFIX}:${environment}:app:*`
    const allKeys = await cacheClient.keys(pattern)

    // Extract nameSlugs and filter by search term in JavaScript
    // Keys format: latitude:pipedream:apps:environment:app:nameSlug:config-type
    // Note: The "latitude:" prefix comes from Redis keyPrefix configuration
    const regex = new RegExp(
      `${CACHE_KEY_PREFIX}:${environment}:app:([^:]+)(?::.*)?$`,
    )

    const searchLower = searchTerm.toLowerCase()
    const matchingSlugs = allKeys
      .map((key) => {
        const match = key.match(regex)
        return match ? match[1] : null
      })
      .filter((slug): slug is string => {
        if (!slug) return false
        // Filter by search term (case-insensitive)
        return slug.toLowerCase().includes(searchLower)
      })

    // Return unique nameSlugs
    const uniqueSlugs = Array.from(new Set(matchingSlugs))

    return Result.ok(uniqueSlugs)
  } catch (error) {
    return Result.error(error as Error)
  }
}
