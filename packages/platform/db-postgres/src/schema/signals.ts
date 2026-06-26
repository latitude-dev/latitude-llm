import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import type { FilterSet, SignalOrigin } from "@domain/shared"
import type { SignalCentroid, SignalPriority, SignalSource } from "@domain/signals"
import { sql } from "drizzle-orm"
import { customType, index, jsonb, text, uniqueIndex, uuid, varchar, vector } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
})

export const signals = latitudeSchema.table(
  "signals",
  {
    id: cuid("id").primaryKey(),
    uuid: uuid("uuid").notNull().unique().defaultRandom(), // legacy stable UUID retained for backwards compatibility; issue search uses the canonical id. New rows get the value from the DB default so the application layer never has to populate it.
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(), // url-safe identifier derived from name; regenerated on rename. Unique per (organization_id, project_id). Length matches `SLUG_MAX_LENGTH` in `@domain/shared/slug`. Backfilled from `name` in the M1 migration cascade; new rows get a slug from `createSignalFromScoreUseCase` (and `refreshSignalDetailsUseCase` regenerates on rename).
    name: varchar("name", { length: 128 }).notNull(), // generated from clustered score feedback and related context; generic enough to represent the shared failure pattern across different backgrounds
    description: text("description").notNull(), // generated from clustered score feedback; focused on the underlying problem rather than one specific conversation
    source: varchar("source", { length: 32 }).$type<SignalSource>().notNull(), // provenance of the first creating score
    origin: varchar("origin", { length: 16 }).$type<SignalOrigin>().default("system").notNull(), // immutable user|system; how the signal was created. Gates annotation assignment; distinct from `source`. Existing rows backfilled to 'system'.
    filters: jsonb("filters").$type<FilterSet>(), // nullable FilterSet pre-gate; only meaningful alongside an evaluation
    assigneeId: cuid("assignee_id", { default: false }), // nullable; user (org member) assigned to triage this issue. No FK (repo convention); not auto-generated.
    priority: varchar("priority", { length: 16 }).$type<SignalPriority>(), // nullable; manual triage priority (low/medium/high/urgent). Null = unset.
    centroid: jsonb("centroid").$type<SignalCentroid>(), // nullable; canonical running weighted sum of clustered score feedback embeddings (discovered signals only — user-created evaluation-backed signals have none). `centroidEmbedding` stores the derived normalized pgvector used for search.
    // No IVFFlat/HNSW index: signals per project are expected in the hundreds to low thousands, so an
    // exact sequential scan over the project-scoped subset outperforms an approximate index (and
    // sidesteps HNSW's recall/precision tradeoff). Revisit if a single project crosses ~10k signals.
    centroidEmbedding: vector("centroid_embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    searchDocument: tsvector("search_document")
      .generatedAlwaysAs(
        (): ReturnType<typeof sql> => sql`
          setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        `,
      )
      .notNull(),
    clusteredAt: tzTimestamp("clustered_at"), // nullable; last time the centroid/cluster state was refreshed (discovered signals only). Authoritative decay anchor (not updatedAt).
    mutedAt: tzTimestamp("muted_at"),
    deletedAt: tzTimestamp("deleted_at"), // soft-delete: signals are soft-deleted by the delete flow; excluded read-side
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("signals"),
    // project-scoped lifecycle filtering and management actions.
    index("signals_project_lifecycle_idx").on(t.organizationId, t.projectId, t.mutedAt, t.createdAt),
    index("signals_search_document_idx").using("gin", t.searchDocument),
    // Soft-delete-aware: a deleted signal frees its slug for reuse.
    uniqueIndex("signals_unique_slug_per_project_idx")
      .on(t.organizationId, t.projectId, t.slug)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
)
