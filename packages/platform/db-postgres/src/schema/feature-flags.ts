import { index, text, unique, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const featureFlags = latitudeSchema.table(
  "feature_flags",
  {
    id: cuid("id").primaryKey(),
    identifier: varchar("identifier", { length: 128 }).notNull().unique(),
    name: varchar("name", { length: 256 }),
    description: text("description"),
    archivedAt: tzTimestamp("archived_at"),
    ...timestamps(),
  },
  (t) => [index("feature_flags_identifier_idx").on(t.identifier)],
)

export const organizationFeatureFlags = latitudeSchema.table(
  "organization_feature_flags",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    featureFlagId: cuid("feature_flag_id").notNull(),
    enabledByAdminUserId: cuid("enabled_by_admin_user_id").notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("organization_feature_flags"),
    index("organization_feature_flags_organization_id_idx").on(t.organizationId),
    index("organization_feature_flags_feature_flag_id_idx").on(t.featureFlagId),
    unique("organization_feature_flags_unique_org_flag_idx").on(t.organizationId, t.featureFlagId),
  ],
)
