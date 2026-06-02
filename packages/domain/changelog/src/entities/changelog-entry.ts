import { z } from "zod"

/**
 * A changelog entry published in the marketing-site CMS (Framer).
 *
 * Entries are global (not organization-scoped) and read-only from the
 * product's perspective — they are authored in Framer and surfaced in-app
 * via the {@link ChangelogReader} port. There are no per-entry product URLs;
 * the only navigable target is the full changelog page.
 */
export const changelogEntrySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().nullable(),
  category: z.string().nullable(),
  /** Framer CMS image field URL, when configured. */
  coverUrl: z.string().nullable(),
  publishedAt: z.date(),
})

export type ChangelogEntry = z.infer<typeof changelogEntrySchema>
