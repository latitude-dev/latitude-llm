import type { SimulationMetadata } from "@domain/simulations"
import { boolean, index, jsonb, text, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const simulations = latitudeSchema.table(
  "simulations",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(), // owning organization
    projectId: cuid("project_id").notNull(), // owning project
    name: varchar("name", { length: 128 }).notNull(), // simulation name (defined in the `*.sim.*` file)
    dataset: varchar("dataset", { length: 24 }).notNull(), // dataset CUID or "CUSTOM" sentinel
    evaluations: varchar("evaluations", { length: 128 }).array().notNull(), // evaluation cuids or custom source ids used during the run
    passed: boolean("passed").notNull(), // true if the full simulation run passed
    errored: boolean("errored").notNull(), // derived helper maintained by application code at write time from whether `error` is present
    metadata: jsonb("metadata").$type<SimulationMetadata>().notNull(),
    error: text("error"), // canonical error text when the simulation failed to run
    startedAt: tzTimestamp("started_at").notNull(), // simulation start timestamp
    finishedAt: tzTimestamp("finished_at").notNull(), // simulation finish timestamp
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("simulations"),
    index("simulations_project_created_at_idx").on(t.organizationId, t.projectId, t.createdAt),
  ],
)
