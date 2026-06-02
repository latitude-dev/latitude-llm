import { type ChangelogEntry, listChangelogEntriesUseCase } from "@domain/changelog"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { ChangelogReaderLive } from "@platform/changelog-framer"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { getRedisClient } from "../../server/clients.ts"

export interface ChangelogEntryRecord {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly summary: string | null
  readonly category: string | null
  readonly coverUrl: string | null
  readonly publishedAt: string
}

const toRecord = (entry: ChangelogEntry): ChangelogEntryRecord => ({
  id: entry.id,
  slug: entry.slug,
  title: entry.title,
  summary: entry.summary,
  category: entry.category,
  coverUrl: entry.coverUrl,
  publishedAt: entry.publishedAt.toISOString(),
})

/**
 * Lists recent changelog entries for the in-app "What's new" popover.
 *
 * Returns an empty list when Framer is unconfigured or unreachable so the UI
 * can simply hide — the changelog is non-critical.
 */
export const listChangelogEntries = createServerFn({ method: "GET" }).handler(
  async (): Promise<readonly ChangelogEntryRecord[]> => {
    try {
      const entries = await Effect.runPromise(
        listChangelogEntriesUseCase({}).pipe(
          Effect.provide(Layer.merge(ChangelogReaderLive, RedisCacheStoreLive(getRedisClient()))),
          withTracing,
        ),
      )
      return entries.map(toRecord)
    } catch {
      return []
    }
  },
)
