/**
 * Slug candidate shape, exactly what `generateSignalSlug` produces: a 3-char
 * alphanumeric prefix (drawn from the project slug, so it may contain digits —
 * `v2-api` yields `V2A`), a hyphen, then a 4-char suffix that is always
 * letter-first (the cuid2 suffix is uppercased and cuid2 never starts with a
 * digit — so year-like tokens such as `PRE-2024` are not candidates). Matched
 * case-insensitively with an optional `#` prefix. The boundaries are non-alnum
 * lookarounds so hyphens delimit (`feature-lat-xy9z`, `lat-xy9z-timeouts` both
 * yield `LAT-XY9Z`) while `flat-xy9z` does not (5.5).
 */
const SLUG_CANDIDATE = /(?<![A-Za-z0-9])#?([A-Za-z0-9]{3}-[A-Za-z][A-Za-z0-9]{3})(?![A-Za-z0-9])/g

/** Uppercased distinct slug candidates in first-seen order within one segment. */
export const extractSlugCandidates = (segment: string): string[] => {
  const found: string[] = []
  const seen = new Set<string>()
  for (const match of segment.matchAll(SLUG_CANDIDATE)) {
    const slug = match[1].toUpperCase()
    if (seen.has(slug)) continue
    seen.add(slug)
    found.push(slug)
  }
  return found
}
