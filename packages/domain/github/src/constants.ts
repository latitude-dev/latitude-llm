/** Repository `integrations.kind` discriminator for GitHub App installations. */
export const GITHUB_INTEGRATION_KIND = "github" as const

export const GITHUB_ACCOUNT_TYPES = ["Organization", "User"] as const
export const GITHUB_REPOSITORY_SELECTIONS = ["all", "selected"] as const

export const GITHUB_REFERENCE_TYPES = ["pull_request", "commit"] as const
export const GITHUB_PR_STATES = ["draft", "open", "merged", "closed"] as const
export const GITHUB_MATCH_ACTIONS = ["resolve", "unresolve", "reference"] as const

export const GITHUB_TEXT_SOURCES = ["commitMessage", "branchName", "prTitle", "prBody"] as const

export const GITHUB_DELIVERY_STATUSES = ["processed", "skipped", "failed"] as const

/** Keyword length/count bounds shared by the entity schema and the settings validation (5.6). */
export const GITHUB_KEYWORD_MAX_LENGTH = 64
export const GITHUB_KEYWORDS_PER_LIST_MAX = 64

/** Longest text a single source is scanned for candidates — the PR-body maximum (5.5). */
export const GITHUB_SOURCE_TEXT_MAX_CHARS = 65_536

/**
 * Built-in magic words, case-insensitive; multi-word entries match as phrases
 * (5.4). Stored settings always hold the full materialized lists, so later
 * edits to these built-ins never silently mutate existing orgs.
 */
export const DEFAULT_RESOLVE_KEYWORDS = [
  "close",
  "closes",
  "closed",
  "closing",
  "fix",
  "fixes",
  "fixed",
  "fixing",
  "resolve",
  "resolves",
  "resolved",
  "resolving",
  "complete",
  "completes",
  "completed",
  "completing",
  "implement",
  "implements",
  "implemented",
  "implementing",
  "address",
  "addresses",
  "addressed",
  "addressing",
  "solve",
  "solves",
  "solved",
  "solving",
] as const

export const DEFAULT_UNRESOLVE_KEYWORDS = [
  "reopen",
  "reopens",
  "reopened",
  "reopening",
  "revert",
  "reverts",
  "reverted",
  "reverting",
  "roll back",
  "rolls back",
  "rolled back",
  "rolling back",
  "back out",
  "backs out",
  "backed out",
] as const

export const DEFAULT_REFERENCE_KEYWORDS = [
  "ref",
  "refs",
  "references",
  "part of",
  "related to",
  "relates to",
  "contributes to",
  "toward",
  "towards",
] as const
