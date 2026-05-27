import { CacheStore } from "@domain/shared"
import { Effect, Option } from "effect"
import { CHANGELOG_CACHE_KEY, CHANGELOG_CACHE_TTL_SECONDS, CHANGELOG_DEFAULT_LIMIT } from "../constants.ts"
import { type ChangelogEntry, changelogEntrySchema } from "../entities/changelog-entry.ts"
import { ChangelogReader } from "../ports/changelog-reader.ts"

const serialize = (entries: readonly ChangelogEntry[]): string =>
  JSON.stringify(entries.map((entry) => ({ ...entry, publishedAt: entry.publishedAt.toISOString() })))

const deserialize = (json: string): ChangelogEntry[] | null => {
  try {
    const raw = JSON.parse(json)
    if (!Array.isArray(raw)) return null
    return raw.map((value) =>
      changelogEntrySchema.parse({
        ...value,
        publishedAt: new Date(value.publishedAt),
      }),
    )
  } catch {
    return null
  }
}

const byPublishedAtDesc = (a: ChangelogEntry, b: ChangelogEntry): number =>
  b.publishedAt.getTime() - a.publishedAt.getTime()

export interface ListChangelogEntriesInput {
  readonly limit?: number
}

/**
 * Returns the latest changelog entries, newest first.
 *
 * Caches the full sorted list under a global key (the changelog is the same
 * for every tenant) when a {@link CacheStore} is available; cache failures are
 * non-fatal and fall through to a fresh read.
 */
export const listChangelogEntriesUseCase = Effect.fn("changelog.listEntries")(function* (
  input: ListChangelogEntriesInput = {},
) {
  const limit = input.limit ?? CHANGELOG_DEFAULT_LIMIT
  const cacheOption = yield* Effect.serviceOption(CacheStore)

  if (Option.isSome(cacheOption)) {
    const cached = yield* cacheOption.value
      .get(CHANGELOG_CACHE_KEY)
      .pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))
    if (cached !== null) {
      const parsed = deserialize(cached)
      if (parsed !== null) {
        return parsed.slice(0, limit)
      }
    }
  }

  const reader = yield* ChangelogReader
  const entries = yield* reader.list()
  const sorted = [...entries].sort(byPublishedAtDesc)

  if (Option.isSome(cacheOption)) {
    yield* cacheOption.value
      .set(CHANGELOG_CACHE_KEY, serialize(sorted), { ttlSeconds: CHANGELOG_CACHE_TTL_SECONDS })
      .pipe(Effect.catchTag("CacheError", () => Effect.void))
  }

  return sorted.slice(0, limit)
})
