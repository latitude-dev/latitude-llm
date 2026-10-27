import type { FilterSet } from "@domain/shared"
import type { TraceDeletionRequester, TraceDeletionStatus } from "@domain/spans"
import { index, integer, jsonb, text, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const traceDeletionRequests = latitudeSchema.table(
  "trace_deletion_requests",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    filters: jsonb("filters").notNull().$type<FilterSet>(),
    status: varchar("status", { length: 16 }).notNull().$type<TraceDeletionStatus>(),
    requestedBy: jsonb("requested_by").notNull().$type<TraceDeletionRequester>(),
    matchedTraceCount: integer("matched_trace_count").notNull().default(0),
    deletedRowCounts: jsonb("deleted_row_counts").notNull().$type<Record<string, number>>(),
    error: text("error"),
    startedAt: tzTimestamp("started_at"),
    completedAt: tzTimestamp("completed_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("trace_deletion_requests"),
    index("trace_deletion_requests_org_project_created_idx").on(t.organizationId, t.projectId, t.createdAt, t.id),
  ],
)
