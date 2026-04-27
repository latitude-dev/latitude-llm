import { boolean, index, integer, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps } from "../schemaHelpers.ts"

export const flaggers = latitudeSchema.table(
  "flaggers",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    /** Strategy slug from the registry (e.g. "jailbreaking", "nsfw", "tool-call-errors"). */
    slug: varchar("slug", { length: 64 }).notNull(),
    /** Gates BOTH the deterministic match path AND the LLM enqueue path. */
    enabled: boolean("enabled").notNull().default(true),
    /**
     * Percentage in [0, 100]. Only consulted by LLM-capable strategies on `no-match`
     * (deterministic-only strategies ignore this field).
     */
    sampling: integer("sampling").notNull().default(10),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("flaggers"),
    index("flaggers_project_list_idx").on(t.organizationId, t.projectId),
    unique("flaggers_unique_slug_per_project_idx").on(t.organizationId, t.projectId, t.slug).nullsNotDistinct(),
  ],
)
