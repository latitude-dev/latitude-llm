import { index, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

// Claim tokens for temporary orgs. Only the SHA-256 `token_hash` is stored (raw token lives in the claim URL).
// Org-scoped RLS; redemption runs on the admin client since there's no org context at claim time.
export const organizationClaims = latitudeSchema.table(
  "organization_claims",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    email: text("email"),
    expiresAt: tzTimestamp("expires_at").notNull(),
    claimedAt: tzTimestamp("claimed_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("organization_claims"),
    uniqueIndex("organization_claims_token_hash_idx").on(t.tokenHash),
    index("organization_claims_organization_id_idx").on(t.organizationId),
  ],
)
