import {
  CHANGELOG_API_BASE_URL,
  CHANGELOG_API_FIRST_PAGE_PATH,
  type ChangelogEntry,
  ChangelogReadError,
  ChangelogReader,
} from "@domain/changelog"
import { parseEnvOptional } from "@platform/env"
import { Effect, Layer } from "effect"
import { type ChangelogApiEntry, type ChangelogApiPage, changelogApiPageSchema } from "./response-schema.ts"

export const absolutizeUrl = (baseUrl: string, path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path
  }
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href
}

export const toChangelogEntry = (entry: ChangelogApiEntry, baseUrl: string): ChangelogEntry | null => {
  const publishedAt = new Date(entry.pubDate)
  if (Number.isNaN(publishedAt.getTime())) {
    return null
  }

  return {
    id: entry.id,
    slug: entry.slug,
    url: absolutizeUrl(baseUrl, entry.url),
    title: entry.title,
    summary: entry.description.length > 0 ? entry.description : null,
    category: entry.type.length > 0 ? entry.type : null,
    coverUrl: entry.image ? absolutizeUrl(baseUrl, entry.image) : null,
    publishedAt,
  }
}

const fetchPage = (pageUrl: string): Effect.Effect<ChangelogApiPage, ChangelogReadError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(pageUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
      })
      if (!response.ok) {
        throw new Error(`Changelog API returned ${response.status} for ${pageUrl}`)
      }
      const json: unknown = await response.json()
      return changelogApiPageSchema.parse(json)
    },
    catch: (cause) => new ChangelogReadError({ message: `Changelog API read failed: ${String(cause)}`, cause }),
  })

const fetchAllEntries = (baseUrl: string): Effect.Effect<readonly ChangelogEntry[], ChangelogReadError> =>
  Effect.gen(function* () {
    let nextPageUrl: string | null = absolutizeUrl(baseUrl, CHANGELOG_API_FIRST_PAGE_PATH)
    const entries: ChangelogEntry[] = []

    while (nextPageUrl !== null) {
      const page: ChangelogApiPage = yield* fetchPage(nextPageUrl)
      for (const entry of page.entries) {
        const mapped = toChangelogEntry(entry, baseUrl)
        if (mapped !== null) {
          entries.push(mapped)
        }
      }
      nextPageUrl = page.nextPageUrl ? absolutizeUrl(baseUrl, page.nextPageUrl) : null
    }

    return entries
  })

/**
 * Live {@link ChangelogReader} backed by the marketing-site static JSON API.
 *
 * Reads `LAT_CHANGELOG_API_BASE_URL` when set; otherwise defaults to
 * {@link CHANGELOG_API_BASE_URL}. Cache the result upstream (the use-case
 * caches via `CacheStore`) so this only runs on a cold cache.
 */
export const ChangelogReaderLive = Layer.effect(
  ChangelogReader,
  Effect.gen(function* () {
    const baseUrlOverride = yield* parseEnvOptional("LAT_CHANGELOG_API_BASE_URL", "string")
    const baseUrl = baseUrlOverride ?? CHANGELOG_API_BASE_URL
    return {
      list: () => fetchAllEntries(baseUrl),
    }
  }),
)
