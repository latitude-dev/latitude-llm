import { index, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export type SandboxStatus = "active" | "archived"

/**
 * 1:1 attributes for sandbox organizations (Test Mode). Standard `id` PK; the
 * 1:1 relationship is enforced by `UNIQUE (organization_id)`, which is also
 * the RLS scoping key (`organization_id = get_current_organization_id()`).
 * `organization_id` points at the *sandbox* org's own id (i.e. the org row
 * with `parent_org_id IS NOT NULL`), so the sandbox middleware's scoped reads
 * see only their own attributes row.
 *
 * Lives in a separate table — not inlined into `organizations` — so Better Auth's
 * adapter keeps owning the BA-managed columns, and sleep/wake metadata stays out of
 * unrelated org reads.
 */
export const sandboxes = latitudeSchema.table(
  "sandboxes",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull().unique(),
    status: varchar("status", { length: 20 }).notNull().default("active").$type<SandboxStatus>(),
    lastActivityAt: tzTimestamp("last_activity_at").notNull().defaultNow(),
    createdByUserId: cuid("created_by_user_id", { default: false }).notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("sandboxes"),
    index("sandboxes_status_last_activity_at_idx").on(t.status, t.lastActivityAt),
    index("sandboxes_created_by_user_id_idx").on(t.createdByUserId),
  ],
)
