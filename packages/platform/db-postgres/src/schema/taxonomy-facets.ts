import { SLUG_MAX_LENGTH } from "@domain/shared"
import {
  FACET_DESCRIPTION_MAX_LENGTH,
  FACET_INSTRUCTIONS_MAX_LENGTH,
  FACET_NAME_MAX_LENGTH,
  type FacetStatus,
} from "@domain/taxonomy"
import { index, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * A project-scoped lens, addressed by a `slug` unique per project so one facet is
 * reused across every view that picks it. `instructions` is free-text guidance
 * compiled into a controlled extraction prompt (write-once — to change what a
 * lens means, create a new facet). `name` + `description` are editable
 * presentation (the picker label and the "why this lens helps" blurb).
 */
export const taxonomyFacets = latitudeSchema.table(
  "taxonomy_facets",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    slug: varchar("slug", { length: SLUG_MAX_LENGTH }).notNull(),
    name: varchar("name", { length: FACET_NAME_MAX_LENGTH }).notNull(),
    description: varchar("description", { length: FACET_DESCRIPTION_MAX_LENGTH }).notNull(),
    instructions: varchar("instructions", { length: FACET_INSTRUCTIONS_MAX_LENGTH }).notNull(),
    status: varchar("status", { length: 16 }).$type<FacetStatus>().notNull().default("pending"),
    // Gardening throttle anchor, stamped at each run start; null = never gardened.
    lastGardenedAt: tzTimestamp("last_gardened_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("taxonomy_facets"),
    index("taxonomy_facets_project_idx").on(t.organizationId, t.projectId),
    unique("taxonomy_facets_unique_slug_per_project_idx").on(t.organizationId, t.projectId, t.slug),
  ],
)
