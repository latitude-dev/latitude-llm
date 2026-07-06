import { z } from "zod"

const changelogApiEntrySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  version: z.string(),
  pubDate: z.string(),
  description: z.string(),
  type: z.string(),
  image: z.string().nullable(),
  imageAlt: z.string().nullable(),
  body: z.string(),
})

export type ChangelogApiEntry = z.infer<typeof changelogApiEntrySchema>

export const changelogApiPageSchema = z.object({
  schemaVersion: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  totalEntries: z.number(),
  count: z.number(),
  previousPageUrl: z.string().nullable(),
  nextPageUrl: z.string().nullable(),
  entries: z.array(changelogApiEntrySchema),
})

export type ChangelogApiPage = z.infer<typeof changelogApiPageSchema>
