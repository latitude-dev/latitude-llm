import type { PartnerScope } from "@domain/partners"
import { boolean, jsonb, text, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Vetted third-party platforms allowed to call the private partner API
 * (`/v1/private/*`), registered by staff in the backoffice.
 *
 * Global staff-managed table: NO `organizationRLSPolicy` — a partner is not
 * tenant data. Reads happen on the runtime connection (signature verification);
 * every write goes through the backoffice admin connection.
 *
 * `hmac_secret` is AES-256-GCM ciphertext (`encryptField`, the `api_keys.token`
 * pattern) rather than a hash: verifying a request signature needs the raw
 * secret back.
 */
export const partners = latitudeSchema.table("partners", {
  id: cuid("id").primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  iconUrl: text("icon_url"),
  /** OAuth callback URLs, stamped comma-joined onto every `oauth_applications` row minted for this partner. */
  redirectUrls: jsonb("redirect_urls").$type<readonly string[]>().notNull(),
  hmacSecret: text("hmac_secret").notNull(),
  scopes: jsonb("scopes").$type<readonly PartnerScope[]>().notNull().default([]),
  /** Single IPs and/or CIDR blocks. Empty means unrestricted. */
  allowedIps: jsonb("allowed_ips").$type<readonly string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  deletedAt: tzTimestamp("deleted_at"),
  ...timestamps(),
})
