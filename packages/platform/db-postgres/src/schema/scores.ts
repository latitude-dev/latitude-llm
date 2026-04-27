import type { ScoreMetadata, ScoreSource } from "@domain/scores"
import { sql } from "drizzle-orm"
import { bigint, boolean, doublePrecision, index, jsonb, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const scores = latitudeSchema.table(
  "scores",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project

    sessionId: varchar("session_id", { length: 128 }), // optional session id inherited from instrumentation
    traceId: varchar("trace_id", { length: 32 }), // optional trace id inherited from instrumentation
    spanId: varchar("span_id", { length: 16 }), // optional span id inherited from instrumentation

    source: varchar("source", { length: 32 }).$type<ScoreSource>().notNull(), // "evaluation" | "annotation" | "custom" | "flagger"
    sourceId: varchar("source_id", { length: 128 }).notNull(), // evaluation cuid, annotation queue cuid or sentinel `"UI"` / `"API"` values, or custom source tag

    simulationId: cuid("simulation_id"), // optional simulation CUID link
    issueId: cuid("issue_id"), // optional issue CUID assignment

    value: doublePrecision("value").notNull(), // normalized [0, 1] score value
    passed: boolean("passed").notNull(), // true if passed, false if failed or errored
    feedback: text("feedback").notNull(), // clusterable feedback text used by issues
    metadata: jsonb("metadata").$type<ScoreMetadata>().notNull(), // JSON-encoded EvaluationScoreMetadata | AnnotationScoreMetadata | CustomScoreMetadata
    error: text("error"), // canonical error text when the score generation truly errored
    errored: boolean("errored").notNull(), // maintained in application/domain code on create or update

    duration: bigint("duration", { mode: "number" }).notNull().default(0), // duration of score generation in nanoseconds
    tokens: bigint("tokens", { mode: "number" }).notNull().default(0), // total LLM token usage for this score generation
    cost: bigint("cost", { mode: "number" }).notNull().default(0), // total LLM cost in microcents

    draftedAt: tzTimestamp("drafted_at"), // set while the score is still editable or awaiting human confirmation
    /** User who created this score (nullable for system-generated scores). */
    annotatorId: cuid("annotator_id"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("scores"),
    index("scores_organization_id_idx").on(t.organizationId),
    index("scores_project_list_idx")
      .on(t.organizationId, t.projectId, t.createdAt, t.id)
      .where(sql`${t.draftedAt} IS NULL`),
    index("scores_source_lookup_idx")
      .on(t.organizationId, t.projectId, t.source, t.sourceId, t.createdAt, t.id)
      .where(sql`${t.draftedAt} IS NULL`),
    uniqueIndex("scores_canonical_evaluation_trace_idx")
      .on(t.organizationId, t.projectId, t.sourceId, t.traceId)
      .where(sql`${t.source} = 'evaluation' AND ${t.draftedAt} IS NULL AND ${t.traceId} IS NOT NULL`),
    index("scores_issue_lookup_idx")
      .on(t.organizationId, t.projectId, t.issueId, t.createdAt, t.id)
      .where(sql`${t.issueId} IS NOT NULL AND ${t.draftedAt} IS NULL`),
    index("scores_trace_lookup_idx")
      .on(t.organizationId, t.projectId, t.traceId, t.createdAt, t.id)
      .where(sql`${t.traceId} IS NOT NULL`),
    index("scores_session_lookup_idx")
      .on(t.organizationId, t.projectId, t.sessionId, t.createdAt, t.id)
      .where(sql`${t.sessionId} IS NOT NULL`),
    index("scores_span_lookup_idx")
      .on(t.organizationId, t.projectId, t.spanId, t.createdAt, t.id)
      .where(sql`${t.spanId} IS NOT NULL`),
    index("scores_issue_discovery_work_idx")
      .on(t.organizationId, t.projectId, t.createdAt, t.id)
      .where(sql`${t.draftedAt} IS NULL AND ${t.errored} = false AND ${t.passed} = false AND ${t.issueId} IS NULL`),
    index("scores_draft_finalization_idx").on(t.updatedAt, t.id).where(sql`${t.draftedAt} IS NOT NULL`),
  ],
)
