import { z } from "zod"
import { GITHUB_KEYWORD_MAX_LENGTH, GITHUB_KEYWORDS_PER_LIST_MAX } from "./constants.ts"
import { githubSyncSourcesSchema } from "./entities/github-sync-config.ts"
import { extractSlugCandidates } from "./matching/candidates.ts"

const ALLOWED_KEYWORD_CHARS = /^[A-Za-z0-9 -]+$/

/** Trim + collapse internal whitespace; keywords are stored in this canonical form. */
export const normalizeKeyword = (raw: string): string => raw.trim().replace(/\s+/g, " ")

/** A keyword may not contain a token shaped like a signal slug (5.6) — it would shadow real references. */
export const isSlugShapedKeyword = (keyword: string): boolean => extractSlugCandidates(keyword).length > 0

/** Case-insensitive dedupe keeping the first occurrence, order preserved. */
export const dedupeKeywords = (keywords: readonly string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const keyword of keywords) {
    const key = keyword.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(keyword)
  }
  return result
}

/**
 * A user-editable keyword list (5.6): each entry 1–64 chars of
 * letters/digits/spaces/hyphens, never slug-shaped, at most 64 stored per list.
 * Blank entries are dropped; the parsed value is normalized and
 * case-insensitively deduped. No user input ever reaches regex syntax — the
 * matcher escapes these literals (see `compileKeywordMatcher`), so there is no
 * ReDoS surface to validate against.
 */
export const githubKeywordListInputSchema = z
  .array(z.string())
  .superRefine((list, ctx) => {
    list.map(normalizeKeyword).forEach((keyword, index) => {
      if (keyword.length === 0) return
      if (keyword.length > GITHUB_KEYWORD_MAX_LENGTH) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: `Keyword "${keyword}" is longer than ${GITHUB_KEYWORD_MAX_LENGTH} characters`,
        })
      } else if (!ALLOWED_KEYWORD_CHARS.test(keyword)) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: `Keyword "${keyword}" may use only letters, digits, spaces and hyphens`,
        })
      } else if (isSlugShapedKeyword(keyword)) {
        ctx.addIssue({ code: "custom", path: [index], message: `Keyword "${keyword}" cannot look like a signal slug` })
      }
    })
    const effective = dedupeKeywords(list.map(normalizeKeyword).filter((keyword) => keyword.length > 0))
    if (effective.length > GITHUB_KEYWORDS_PER_LIST_MAX) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: `At most ${GITHUB_KEYWORDS_PER_LIST_MAX} keywords are allowed`,
      })
    }
  })
  .transform((list) => dedupeKeywords(list.map(normalizeKeyword).filter((keyword) => keyword.length > 0)))

export const githubMatchingRulesInputSchema = z.object({
  resolveKeywords: githubKeywordListInputSchema,
  unresolveKeywords: githubKeywordListInputSchema,
  referenceKeywords: githubKeywordListInputSchema,
})

export const githubMonitorSettingsInputSchema = z.object({
  monitorPullRequests: z.boolean(),
  monitorCommits: z.boolean(),
  sources: githubSyncSourcesSchema,
  rules: githubMatchingRulesInputSchema,
})
