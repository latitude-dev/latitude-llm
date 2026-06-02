import { FULL_CHANGELOG_URL } from "@domain/changelog"
import type { ChangelogEntryRecord } from "../../../../domains/changelog/changelog.functions.ts"

/** Persisted when the user collapses the sidebar changelog banner. */
export type ChangelogBannerDismissed = {
  readonly entryId: string
  readonly publishedAt: string
}

export const changelogEntryUrl = (entry: ChangelogEntryRecord) => `${FULL_CHANGELOG_URL}/${entry.slug}`

/** Snapshot to store when the user dismisses the banner for the current latest entry. */
export const toDismissedBannerState = (entry: ChangelogEntryRecord): ChangelogBannerDismissed => ({
  entryId: entry.id,
  publishedAt: entry.publishedAt,
})

/**
 * Parses localStorage value (supports legacy plain entry-id strings).
 */
export const parseDismissedBannerState = (value: unknown): ChangelogBannerDismissed | null => {
  if (value === null) {
    return null
  }
  if (typeof value === "string" && value.length > 0) {
    return { entryId: value, publishedAt: "" }
  }
  if (typeof value === "object" && value !== null && "entryId" in value) {
    const entryId = (value as { entryId?: unknown }).entryId
    if (typeof entryId !== "string" || entryId.length === 0) {
      return null
    }
    const publishedAt = (value as { publishedAt?: unknown }).publishedAt
    return {
      entryId,
      publishedAt: typeof publishedAt === "string" ? publishedAt : "",
    }
  }
  return null
}

/**
 * True when the user dismissed this exact latest entry (id + publishedAt).
 * A new Framer item (new id) or a changed publish date re-opens the banner.
 */
export const isChangelogBannerDismissed = (
  latest: ChangelogEntryRecord,
  dismissed: ChangelogBannerDismissed | null,
): boolean => {
  if (dismissed === null) {
    return false
  }
  if (latest.id !== dismissed.entryId) {
    return false
  }
  if (dismissed.publishedAt === "") {
    return true
  }
  return latest.publishedAt === dismissed.publishedAt
}
