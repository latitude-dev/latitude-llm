import { z } from "zod"

/**
 * A changelog entry published on the marketing site.
 *
 * Entries are global (not organization-scoped) and read-only from the
 * product's perspective — they are authored in the marketing-site content
 * repo and surfaced in-app via the {@link ChangelogReader} port.
 */
export const changelogEntrySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  /** Absolute URL to the entry on the marketing site. */
  url: z.string().url(),
  title: z.string().min(1),
  summary: z.string().nullable(),
  category: z.string().nullable(),
  coverUrl: z.string().nullable(),
  publishedAt: z.date(),
})

export type ChangelogEntry = z.infer<typeof changelogEntrySchema>
