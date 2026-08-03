import type { GithubMatchAction, GithubPrState, GithubReferenceType, GithubTextSource } from "@domain/github"
import { sql } from "drizzle-orm"
import { bigint, index, integer, jsonb, text, uniqueIndex } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * The N:M reference between a signal and a PR/commit — the product entity behind the
 * detail-page pill (5.11). Dedup uniques live here (one row per signal ×
 * PR/commit), and the applied-action provenance (`action`, `action_applied_at`,
 * `url`, `author_login`) is recorded here rather than on the signal (D7).
 * `push_after_sha` powers rebase-merge absorption (5.9). References are historical
 * records: applied references are never deleted (D8).
 */
export const githubSignalReferences = latitudeSchema.table(
  "github_signal_references",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    signalId: cuid("signal_id").notNull(),
    integrationId: cuid("integration_id").notNull(),
    repoId: bigint("repo_id", { mode: "number" }).notNull(),
    repoFullName: text("repo_full_name").notNull(),
    referenceType: text("reference_type").$type<GithubReferenceType>().notNull(),
    prNumber: integer("pr_number"),
    prState: text("pr_state").$type<GithubPrState>(),
    commitSha: text("commit_sha"),
    pushAfterSha: text("push_after_sha"),
    title: text("title").notNull(),
    url: text("url").notNull(),
    authorLogin: text("author_login"),
    matchedSources: jsonb("matched_sources").$type<GithubTextSource[]>().notNull(),
    action: text("action").$type<GithubMatchAction>().notNull(),
    actionAppliedAt: tzTimestamp("action_applied_at"),
    mergedAt: tzTimestamp("merged_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("github_signal_references"),
    uniqueIndex("github_signal_references_pr_uq")
      .on(t.organizationId, t.signalId, t.repoId, t.prNumber)
      .where(sql`${t.referenceType} = 'pull_request'`),
    uniqueIndex("github_signal_references_commit_uq")
      .on(t.organizationId, t.signalId, t.repoId, t.commitSha)
      .where(sql`${t.referenceType} = 'commit'`),
    index("github_signal_references_signal_idx").on(t.organizationId, t.signalId),
    index("github_signal_references_repo_commit_idx").on(t.organizationId, t.repoId, t.commitSha),
    index("github_signal_references_repo_pr_idx").on(t.organizationId, t.repoId, t.prNumber),
  ],
)
