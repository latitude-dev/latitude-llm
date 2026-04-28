import type { IssueCentroid, IssueKind, IssueSource } from "@domain/issues"
import { index, jsonb, text, uuid, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const issues = latitudeSchema.table(
  "issues",
  {
    id: cuid("id").primaryKey(),
    uuid: uuid("uuid").notNull().unique(), // links the Postgres row with the Weaviate object for hydration and projection sync
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    name: varchar("name", { length: 128 }).notNull(), // generated from clustered score feedback and related context; generic enough to represent the shared failure pattern across different backgrounds
    description: text("description").notNull(), // generated from clustered score feedback; focused on the underlying problem rather than one specific conversation
    source: varchar("source", { length: 32 }).$type<IssueSource>().notNull(), // provenance of the first creating score
    kind: varchar("kind", { length: 32 }).$type<IssueKind>().default("regular").notNull(), // potential issues come from draft flagger scores awaiting human confirmation
    centroid: jsonb("centroid").$type<IssueCentroid>().notNull(), // running weighted sum of clustered score feedback embeddings; do not add JSONB indexes — centroid search is served by the Weaviate projection
    clusteredAt: tzTimestamp("clustered_at").notNull(), // last time the centroid/cluster state was refreshed; used as the authoritative decay anchor (not updatedAt)
    escalatedAt: tzTimestamp("escalated_at"), // latest escalation transition timestamp
    resolvedAt: tzTimestamp("resolved_at"), // issue resolved automatically (inactivity) or manually
    ignoredAt: tzTimestamp("ignored_at"), // issue ignored manually
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("issues"),
    // project-scoped lifecycle filtering and management actions; do not add Postgres text-search indexes on name or description — issue search lives in Weaviate
    index("issues_project_lifecycle_idx").on(t.organizationId, t.projectId, t.ignoredAt, t.resolvedAt, t.createdAt),
  ],
)
