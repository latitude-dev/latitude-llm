import type { FlaggerSamplingSource, FlaggerSlug } from "@domain/flaggers"
import { boolean, index, integer, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps } from "../schemaHelpers.ts"

export const flaggers = latitudeSchema.table(
  "flaggers",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    slug: varchar("slug", { length: 64 }).$type<FlaggerSlug>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    sampling: integer("sampling").notNull().default(10),
    // Who last set `sampling`. The Agent Score sweep derives a rate from the project's traffic,
    // because a fixed share cannot meet a fixed examined-count floor across projects of different
    // sizes, and it must never overwrite a rate somebody chose. Deliberately not on the `Flagger`
    // entity: nothing in the product shows it, and only the sweep's own write needs to read it.
    // Screening is untouched and still reads `sampling`, so Settings shows the rate that runs.
    samplingSource: varchar("sampling_source", { length: 16 })
      .$type<FlaggerSamplingSource>()
      .notNull()
      .default("default"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("flaggers"),
    index("flaggers_project_list_idx").on(t.organizationId, t.projectId),
    unique("flaggers_unique_slug_per_project_idx").on(t.organizationId, t.projectId, t.slug).nullsNotDistinct(),
  ],
)
