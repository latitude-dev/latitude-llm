import { CENTROID_EMBEDDING_DIMENSIONS, type IssueCentroid, type IssueSource } from "@domain/issues"
import { sql } from "drizzle-orm"
import { customType, index, jsonb, text, unique, uuid, varchar, vector } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
})

export const issues = latitudeSchema.table(
  "issues",
  {
    id: cuid("id").primaryKey(),
    uuid: uuid("uuid").notNull().unique().defaultRandom(), // legacy stable UUID retained for backwards compatibility; issue search uses the canonical id. New rows get the value from the DB default so the application layer never has to populate it.
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(), // url-safe identifier derived from name; regenerated on rename. Unique per (organization_id, project_id). Length matches `SLUG_MAX_LENGTH` in `@domain/shared/slug`. Backfilled from `name` in the M1 migration cascade; new rows get a slug from `createIssueFromScoreUseCase` (and `refreshIssueDetailsUseCase` regenerates on rename).
    name: varchar("name", { length: 128 }).notNull(), // generated from clustered score feedback and related context; generic enough to represent the shared failure pattern across different backgrounds
    description: text("description").notNull(), // generated from clustered score feedback; focused on the underlying problem rather than one specific conversation
    source: varchar("source", { length: 32 }).$type<IssueSource>().notNull(), // provenance of the first creating score
    centroid: jsonb("centroid").$type<IssueCentroid>().notNull(), // canonical running weighted sum of clustered score feedback embeddings; `centroidEmbedding` stores the derived normalized pgvector used for search.
    // No IVFFlat/HNSW index: issues per project are expected in the hundreds to low thousands, so an
    // exact sequential scan over the project-scoped subset outperforms an approximate index (and
    // sidesteps HNSW's recall/precision tradeoff). Revisit if a single project crosses ~10k issues.
    centroidEmbedding: vector("centroid_embedding", { dimensions: CENTROID_EMBEDDING_DIMENSIONS }),
    searchDocument: tsvector("search_document")
      .generatedAlwaysAs(
        (): ReturnType<typeof sql> => sql`
          setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        `,
      )
      .notNull(),
    clusteredAt: tzTimestamp("clustered_at").notNull(), // last time the centroid/cluster state was refreshed; used as the authoritative decay anchor (not updatedAt)
    escalatedAt: tzTimestamp("escalated_at"), // DORMANT: not maintained by the system. "Currently escalating" is derived from open `alert_incidents` rows. Kept for backward compatibility; always null in practice.
    resolvedAt: tzTimestamp("resolved_at"), // issue resolved manually
    ignoredAt: tzTimestamp("ignored_at"), // issue ignored manually
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("issues"),
    // project-scoped lifecycle filtering and management actions.
    index("issues_project_lifecycle_idx").on(t.organizationId, t.projectId, t.ignoredAt, t.resolvedAt, t.createdAt),
    index("issues_search_document_idx").using("gin", t.searchDocument),
    // Issues are not soft-deleted, so a plain unique constraint is sufficient
    // (no need for `nullsNotDistinct` over a deletedAt column).
    unique("issues_unique_slug_per_project_idx").on(t.organizationId, t.projectId, t.slug),
  ],
)
