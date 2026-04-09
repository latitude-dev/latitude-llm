import type { AnnotationQueueSettings } from "@domain/annotation-queues"
import { boolean, index, integer, jsonb, text, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const annotationQueues = latitudeSchema.table(
  "annotation_queues",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    system: boolean("system").notNull().default(false),
    name: varchar("name", { length: 128 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    description: text("description").notNull(),
    instructions: text("instructions").notNull(), // guidance shown to annotators while reviewing the queue
    settings: jsonb("settings").$type<AnnotationQueueSettings>().notNull(),
    assignees: varchar("assignees", { length: 24 }).array().notNull(),
    totalItems: integer("total_items").notNull().default(0),
    completedItems: integer("completed_items").notNull().default(0),
    deletedAt: tzTimestamp("deleted_at"),
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
    index("annotation_queues_project_system_slug_idx").on(t.organizationId, t.projectId, t.system, t.slug),
  ],
)

export const annotationQueueItems = latitudeSchema.table(
  "annotation_queue_items",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    queueId: cuid("queue_id").notNull(),
    traceId: varchar("trace_id", { length: 32 }).notNull(),
    completedAt: tzTimestamp("completed_at"),
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
      t.createdAt,
      t.traceId,
    ),
    unique("annotation_queue_items_unique_trace_per_queue_idx").on(t.organizationId, t.projectId, t.queueId, t.traceId),
  ],
)
