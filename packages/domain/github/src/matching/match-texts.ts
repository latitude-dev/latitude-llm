import type { GithubMatchingRules } from "../entities/github-sync-config.ts"
import { extractSlugCandidates } from "./candidates.ts"
import { classifySegment, compileMatchingRules } from "./keywords.ts"
import { segmentText } from "./segmentation.ts"
import type { GithubMatchAction, GithubTextSource, MatchResult, MatchTextInput } from "./types.ts"

const ACTION_STRENGTH: Record<GithubMatchAction, number> = { reference: 1, resolve: 2, unresolve: 3 }

/**
 * The pure reference-matching engine (5.5): scans each source text for slug
 * candidates co-located with a keyword in the same segment, and returns one
 * result per distinct slug carrying the strongest action across every segment
 * and source (unresolve > resolve > reference) plus the sources that matched
 * it. A slug with no keyword in its segment never appears. Slug resolution to a
 * real signal (per-project `findBySlug`) happens downstream — this stage is
 * deliberately permissive.
 */
export const matchTexts = (inputs: readonly MatchTextInput[], rules: GithubMatchingRules): MatchResult[] => {
  const compiled = compileMatchingRules(rules)
  const bySlug = new Map<string, { action: GithubMatchAction; sources: Set<GithubTextSource> }>()

  for (const input of inputs) {
    for (const segment of segmentText(input.source, input.text)) {
      const candidates = extractSlugCandidates(segment)
      if (candidates.length === 0) continue
      const action = classifySegment(segment, compiled)
      if (action === null) continue

      for (const slug of candidates) {
        const existing = bySlug.get(slug)
        if (!existing) {
          bySlug.set(slug, { action, sources: new Set([input.source]) })
          continue
        }
        existing.sources.add(input.source)
        if (ACTION_STRENGTH[action] > ACTION_STRENGTH[existing.action]) existing.action = action
      }
    }
  }

  return [...bySlug.entries()].map(([slug, matched]) => ({
    slug,
    action: matched.action,
    sources: [...matched.sources],
  }))
}
