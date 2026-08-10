import type { GithubMatchingRules } from "../entities/github-sync-config.ts"
import type { GithubMatchAction } from "./types.ts"

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Compiles a keyword list into a case-insensitive, word-bounded alternation of
 * escaped literals — user input never reaches regex syntax, so there is no
 * ReDoS surface (5.6). Boundaries are non-alnum lookarounds so a keyword abuts
 * hyphens/slashes (`fix` in `fix-lat-xy9z`). Empty list → never matches.
 */
export const compileKeywordMatcher = (keywords: readonly string[]): RegExp | null => {
  const cleaned = keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0)
  if (cleaned.length === 0) return null
  const alternation = cleaned.map(escapeRegExp).join("|")
  return new RegExp(`(?<![A-Za-z0-9])(?:${alternation})(?![A-Za-z0-9])`, "i")
}

export interface CompiledMatchingRules {
  readonly resolve: RegExp | null
  readonly unresolve: RegExp | null
  readonly reference: RegExp | null
}

export const compileMatchingRules = (rules: GithubMatchingRules): CompiledMatchingRules => ({
  resolve: compileKeywordMatcher(rules.resolveKeywords),
  unresolve: compileKeywordMatcher(rules.unresolveKeywords),
  reference: compileKeywordMatcher(rules.referenceKeywords),
})

/** Strongest action whose keyword appears in the segment, or null. Precedence: unresolve > resolve > reference (5.5). */
export const classifySegment = (segment: string, rules: CompiledMatchingRules): GithubMatchAction | null => {
  if (rules.unresolve?.test(segment)) return "unresolve"
  if (rules.resolve?.test(segment)) return "resolve"
  if (rules.reference?.test(segment)) return "reference"
  return null
}
