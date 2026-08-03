import { cuidSchema, organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"
import {
  DEFAULT_REFERENCE_KEYWORDS,
  DEFAULT_RESOLVE_KEYWORDS,
  DEFAULT_UNRESOLVE_KEYWORDS,
  GITHUB_KEYWORD_MAX_LENGTH,
  GITHUB_KEYWORDS_PER_LIST_MAX,
} from "../constants.ts"

const keywordListSchema = z.array(z.string().min(1).max(GITHUB_KEYWORD_MAX_LENGTH)).max(GITHUB_KEYWORDS_PER_LIST_MAX)

export const githubMatchingRulesSchema = z.object({
  resolveKeywords: keywordListSchema,
  unresolveKeywords: keywordListSchema,
  referenceKeywords: keywordListSchema,
})
export type GithubMatchingRules = z.infer<typeof githubMatchingRulesSchema>

export const githubSyncSourcesSchema = z.object({
  commitMessage: z.boolean(),
  branchName: z.boolean(),
  prTitle: z.boolean(),
  prBody: z.boolean(),
})
export type GithubSyncSources = z.infer<typeof githubSyncSourcesSchema>

export const githubMonitorSettingsSchema = z.object({
  monitorPullRequests: z.boolean(),
  monitorCommits: z.boolean(),
  sources: githubSyncSourcesSchema,
  rules: githubMatchingRulesSchema,
})
export type GithubMonitorSettings = z.infer<typeof githubMonitorSettingsSchema>

/** Built-in org defaults seeded at claim time; the full lists are materialized so later built-in edits don't mutate existing orgs (5.4). */
export const DEFAULT_GITHUB_MONITOR_SETTINGS: GithubMonitorSettings = {
  monitorPullRequests: true,
  monitorCommits: true,
  sources: { commitMessage: true, branchName: true, prTitle: true, prBody: true },
  rules: {
    resolveKeywords: [...DEFAULT_RESOLVE_KEYWORDS],
    unresolveKeywords: [...DEFAULT_UNRESOLVE_KEYWORDS],
    referenceKeywords: [...DEFAULT_REFERENCE_KEYWORDS],
  },
}

/**
 * A stored sync-config row. `projectId === null` marks the org-wide default for
 * the integration (repo fields null, behavior fields non-null, seeded with the
 * built-ins); a set `projectId` is a monitored repo+branch where each behavior
 * field is null to inherit the default or non-null to replace it wholesale (5.4).
 */
export const githubSyncConfigRowSchema = z.object({
  id: cuidSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema.nullable(),
  integrationId: cuidSchema,
  repoId: z.number().int().positive().nullable(),
  repoFullName: z.string().nullable(),
  branch: z.string().nullable(),
  enabled: z.boolean(),
  monitorPullRequests: z.boolean().nullable(),
  monitorCommits: z.boolean().nullable(),
  sources: githubSyncSourcesSchema.nullable(),
  rules: githubMatchingRulesSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type GithubSyncConfigRow = z.infer<typeof githubSyncConfigRowSchema>
