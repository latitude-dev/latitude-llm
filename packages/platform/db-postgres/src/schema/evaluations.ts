import type { EvaluationAlignment, EvaluationTrigger } from "@domain/evaluations"
import type { EvaluationSettings } from "@domain/shared"
import { sql } from "drizzle-orm"
import { index, jsonb, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const evaluations = latitudeSchema.table(
  "evaluations",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project
    signalId: cuid("signal_id").notNull(), // in MVP evaluations are issue-linked; multiple evaluations may link to the same issue
    name: varchar("name", { length: 128 }).notNull(), // derived from the owning signal's name; not unique
    description: text("description").notNull(), // generated from the resulting script after alignment
    settings: jsonb("settings").$type<EvaluationSettings>(), // nullable declarative config that compiles to `script`; NULL for a raw / GEPA-generated script
    script: text("script").notNull(), // javascript-like evaluation script that runs inside a sandbox/runtime wrapper
    scriptHash: text("script_hash"), // hash of `script`; the writer stamps it on each score's metadata.evaluationHash. Backfilled from alignment.evaluationHash; nullable only transiently during backfill.
    trigger: jsonb("trigger").$type<EvaluationTrigger>().notNull(), // controls when the evaluation runs on live traffic
    alignment: jsonb("alignment").$type<EvaluationAlignment>(), // nullable; confusion matrix + script hash, set only for aligned judge scripts (those that call llm())
    alignedAt: tzTimestamp("aligned_at"), // nullable; last realignment time (judge scripts only)
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
    index("evaluations_signal_lookup_idx").on(t.organizationId, t.projectId, t.signalId, t.deletedAt),
    // exactly one ACTIVE detector evaluation per signal (archived predecessors kept for lineage)
    uniqueIndex("evaluations_active_detector_idx")
      .on(t.signalId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.archivedAt} IS NULL`),
    // "list active detectors" for the signals matching pipeline
    index("evaluations_active_detector_lookup_idx")
      .on(t.organizationId, t.projectId, t.signalId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.archivedAt} IS NULL`),
  ],
)
