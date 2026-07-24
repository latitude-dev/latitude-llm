import type { GithubMatchingRules, GithubSyncSources } from "@domain/github"
import { sql } from "drizzle-orm"
import { bigint, boolean, index, jsonb, text, uniqueIndex } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps } from "../schemaHelpers.ts"

/**
 * Org-default + per-project repo sync configs, using the
 * {@link agentDispatchConfigs} single-table cascade.
 *
 * - `project_id IS NULL` — the org-default row for an integration (repo fields
 *   null, behavior fields non-null, seeded with the built-ins at claim time);
 *   at most one per `integration_id`.
 * - `project_id` set — one override row per project: its chosen repo+branch
 *   (which may be the org default's, e.g. a monorepo shared across projects),
 *   with each behavior field null to inherit the default or non-null to replace
 *   it wholesale (5.4). At most one such row per project.
 */
export const githubSyncConfigs = latitudeSchema.table(
  "github_sync_configs",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id"),
    integrationId: cuid("integration_id").notNull(),
    repoId: bigint("repo_id", { mode: "number" }),
    repoFullName: text("repo_full_name"),
    branch: text("branch"),
    enabled: boolean("enabled").notNull().default(true),
    monitorPullRequests: boolean("monitor_pull_requests"),
    monitorCommits: boolean("monitor_commits"),
    sources: jsonb("sources").$type<GithubSyncSources>(),
    rules: jsonb("rules").$type<GithubMatchingRules>(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("github_sync_configs"),
    index("github_sync_configs_organization_repo_idx").on(t.organizationId, t.repoId),
    index("github_sync_configs_integration_idx").on(t.integrationId),
    uniqueIndex("github_sync_configs_default_uq").on(t.integrationId).where(sql`${t.projectId} IS NULL`),
    uniqueIndex("github_sync_configs_project_uq")
      .on(t.projectId, t.integrationId)
      .where(sql`${t.projectId} IS NOT NULL`),
  ],
)
