import type { EvaluationAlignment, EvaluationTrigger } from "@domain/evaluations"
import { index, jsonb, text, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const evaluations = latitudeSchema.table(
  "evaluations",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project
    issueId: cuid("issue_id").notNull(), // in MVP evaluations are issue-linked; multiple evaluations may link to the same issue
    name: varchar("name", { length: 128 }).notNull(), // unique name within the project among non-deleted rows
    description: text("description").notNull(), // generated from the resulting script after alignment
    script: text("script").notNull(), // javascript-like evaluation script that runs inside a sandbox/runtime wrapper
    trigger: jsonb("trigger").$type<EvaluationTrigger>().notNull(), // controls when the evaluation runs on live traffic
    alignment: jsonb("alignment").$type<EvaluationAlignment>().notNull(), // persisted confusion matrix and script hash
    alignedAt: tzTimestamp("aligned_at").notNull(), // last time the evaluation was realigned
    archivedAt: tzTimestamp("archived_at"), // archived evaluations are still visible in read-only mode
    deletedAt: tzTimestamp("deleted_at"), // deleted evaluations are soft deleted from management UI
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("evaluations"),
    // active/archived project list views
    index("evaluations_project_lifecycle_idx").on(
      t.organizationId,
      t.projectId,
      t.deletedAt,
      t.archivedAt,
      t.createdAt,
    ),
    // issue-linked evaluation lookups and issue-driven lifecycle updates
    index("evaluations_issue_lookup_idx").on(t.organizationId, t.projectId, t.issueId, t.deletedAt),
    // soft-delete-aware unique name per project; nulls-not-distinct ensures only one active row per name
    unique("evaluations_unique_name_per_project_idx")
      .on(t.organizationId, t.projectId, t.name, t.deletedAt)
      .nullsNotDistinct(),
  ],
)
