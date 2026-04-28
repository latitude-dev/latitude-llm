import type { AnnotationQueueSettings } from "@domain/annotation-queues"
import { boolean, index, integer, jsonb, text, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const annotationQueues = latitudeSchema.table(
  "annotation_queues",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project
    // TODO(remove-sys-annot-queues): drop this column once dormant `system: true` rows
    // (orphan system queues from before the flaggers refactor) are confirmed safe to delete.
    system: boolean("system").notNull().default(false),
    name: varchar("name", { length: 128 }).notNull(), // unique queue name within the project
    slug: varchar("slug", { length: 140 }).notNull(), // unique queue slug within the project
    description: text("description").notNull(),
    instructions: text("instructions").notNull(), // guidance shown to annotators while reviewing the queue
    settings: jsonb("settings").$type<AnnotationQueueSettings>().notNull(), // queue is conceptually "live" when settings.filter is present; system queues keep filter absent but may still store sampling
    assignees: varchar("assignees", { length: 24 }).array().notNull(), // assigned user ids; empty array when unassigned
    totalItems: integer("total_items").notNull().default(0), // denormalized count of queue items; maintained by item insert/delete
    completedItems: integer("completed_items").notNull().default(0), // denormalized count of completed items; maintained by item complete/uncomplete/delete
    deletedAt: tzTimestamp("deleted_at"), // soft deletion timestamp
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("annotation_queues"),
    index("annotation_queues_project_list_idx").on(t.organizationId, t.projectId, t.deletedAt, t.createdAt),
    unique("annotation_queues_unique_name_per_project_idx")
      .on(t.organizationId, t.projectId, t.name, t.deletedAt)
      .nullsNotDistinct(),
    unique("annotation_queues_unique_slug_per_project_idx")
      .on(t.organizationId, t.projectId, t.slug, t.deletedAt)
      .nullsNotDistinct(),
  ],
)

export const annotationQueueItems = latitudeSchema.table(
  "annotation_queue_items",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project
    queueId: cuid("queue_id").notNull(),
    traceId: varchar("trace_id", { length: 32 }).notNull(), // ClickHouse trace id of the queued trace
    traceCreatedAt: tzTimestamp("trace_created_at").notNull(), // the trace's startTime from ClickHouse
    completedAt: tzTimestamp("completed_at"), // set when a reviewer marks the queue item as fully annotated
    /** User who marked the item complete (nullable until completed). */
    completedBy: cuid("completed_by"),
    /** First time the reviewer opened the focused queue item (nullable until opened). */
    reviewStartedAt: tzTimestamp("review_started_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("annotation_queue_items"),
    index("annotation_queue_items_queue_progress_idx").on(
      t.organizationId,
      t.projectId,
      t.queueId,
      t.completedAt,
      t.traceCreatedAt,
      t.traceId,
    ),
    unique("annotation_queue_items_unique_trace_per_queue_idx").on(t.organizationId, t.projectId, t.queueId, t.traceId),
  ],
)
