import type { GithubSignalReferenceRecord } from "../../../../../../../domains/github/github.functions.ts"

const ms = (iso: string | null): number => (iso ? Date.parse(iso) : 0)

const isPr = (reference: GithubSignalReferenceRecord): boolean => reference.referenceType === "pull_request"

// The reference's last event time. `updatedAt` is bumped on every merge/edit/state change, so it
// dominates `mergedAt`/`createdAt`; the max keeps ordering correct even if a row skipped a bump.
const eventTime = (reference: GithubSignalReferenceRecord): number =>
  Math.max(ms(reference.mergedAt), ms(reference.updatedAt), ms(reference.createdAt))

const byMostRecentDesc = (a: GithubSignalReferenceRecord, b: GithubSignalReferenceRecord): number =>
  eventTime(b) - eventTime(a)

/**
 * The reference summarized by the pill (5.11): PRs beat commits, and within each the
 * most recent event (merge, push, edit, or state change) wins.
 */
export function selectPrimaryGithubReference(
  references: readonly GithubSignalReferenceRecord[],
): GithubSignalReferenceRecord | undefined {
  if (references.length === 0) return undefined
  const prs = references.filter(isPr).sort(byMostRecentDesc)
  if (prs.length > 0) return prs[0]
  return [...references].sort(byMostRecentDesc)[0]
}

/** The popover row order (5.11): PRs first (most-recent-first), then commits (most-recent-first). */
export function sortGithubReferencesForList(
  references: readonly GithubSignalReferenceRecord[],
): GithubSignalReferenceRecord[] {
  const prs = references.filter(isPr).sort(byMostRecentDesc)
  const commits = references.filter((reference) => !isPr(reference)).sort(byMostRecentDesc)
  return [...prs, ...commits]
}
