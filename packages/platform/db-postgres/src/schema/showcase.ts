import type { ShowcaseNextState } from "@domain/showcase"
import { sql } from "drizzle-orm"
import { check, integer, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, timestamps } from "../schemaHelpers.ts"

/**
 * Singleton showcase pointer — exactly one row, keyed on `id = 1`. The single
 * row structurally enforces "one current / one next" project.
 *
 * System/config table: NO `organizationRLSPolicy` (it *stores* an org id, it
 * isn't org-scoped data), so the runtime user reads it directly. The
 * accompanying migration grants `SELECT`/`UPDATE` to `latitude_app`. Id columns
 * are plain cuids with no FK constraints (repo-wide no-FK rule).
 */
export const showcase = latitudeSchema.table(
  "showcase",
  {
    id: integer("id").primaryKey().default(1),
    organizationId: cuid("organization_id", { default: false }).notNull(),
    currentProjectId: cuid("current_project_id", { default: false }),
    nextProjectId: cuid("next_project_id", { default: false }),
    nextState: varchar("next_state", { length: 16 }).$type<ShowcaseNextState>(),
    ...timestamps(),
  },
  (t) => [check("showcase_singleton_check", sql`${t.id} = 1`)],
)
