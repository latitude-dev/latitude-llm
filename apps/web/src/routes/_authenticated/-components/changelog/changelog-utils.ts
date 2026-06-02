import { FULL_CHANGELOG_URL } from "@domain/changelog"
import type { ChangelogEntryRecord } from "../../../../domains/changelog/changelog.functions.ts"

const RECENT_ENTRY_WINDOW_MS = 48 * 60 * 60 * 1000

export const changelogEntryUrl = (entry: ChangelogEntryRecord) => `${FULL_CHANGELOG_URL}/${entry.slug}`

export const isRecentlyPublished = (entry: ChangelogEntryRecord, now: number) => {
  const publishedAt = new Date(entry.publishedAt).getTime()
  const age = now - publishedAt
  return !Number.isNaN(publishedAt) && age >= 0 && age <= RECENT_ENTRY_WINDOW_MS
}
