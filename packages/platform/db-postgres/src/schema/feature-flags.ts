import { boolean, index, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps } from "../schemaHelpers.ts"

export const featureFlags = latitudeSchema.table("feature_flags", {
  identifier: varchar("identifier", { length: 128 }).primaryKey(),
  enabledForAll: boolean("enabled_for_all").notNull().default(false),
  ...timestamps(),
})

export const organizationFeatureFlags = latitudeSchema.table(
  "organization_feature_flags",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    identifier: varchar("identifier", { length: 128 }).notNull(),
    enabledByAdminUserId: cuid("enabled_by_admin_user_id").notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("organization_feature_flags"),
    index("organization_feature_flags_organization_id_idx").on(t.organizationId),
    index("organization_feature_flags_identifier_idx").on(t.identifier),
    unique("organization_feature_flags_unique_org_identifier_idx").on(t.organizationId, t.identifier),
  ],
)
