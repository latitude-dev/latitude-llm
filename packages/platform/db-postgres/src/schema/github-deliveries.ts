import { sql } from "drizzle-orm"
import { bigint, boolean, index, integer, text, uniqueIndex } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Webhook delivery ledger: the idempotency claim (`delivery_id` unique) plus an
 * audit/debug surface. Merged-PR rows double as the push↔PR attribution record
 * via the stamped `pr_number`/`merge_commit_sha`/`head_sha` join keys, so there
 * is no separate merges table (5.9). `status` is null while a delivery is
 * claimed but not yet finalized. Pruned after 30 days (Phase 5).
 */
export const githubDeliveries = latitudeSchema.table(
  "github_deliveries",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    integrationId: cuid("integration_id").notNull(),
    deliveryId: text("delivery_id").notNull(),
    event: text("event").notNull(),
    action: text("action"),
    repoId: bigint("repo_id", { mode: "number" }),
    status: text("status"),
    skipReason: text("skip_reason"),
    errorCategory: text("error_category"),
    errorDetail: text("error_detail"),
    truncated: boolean("truncated").notNull().default(false),
    prNumber: integer("pr_number"),
    mergeCommitSha: text("merge_commit_sha"),
    headSha: text("head_sha"),
    receivedAt: tzTimestamp("received_at").notNull().defaultNow(),
    processedAt: tzTimestamp("processed_at"),
  },
  (t) => [
    organizationRLSPolicy("github_deliveries"),
    uniqueIndex("github_deliveries_delivery_uq").on(t.deliveryId),
    index("github_deliveries_organization_received_idx").on(t.organizationId, t.receivedAt),
    index("github_deliveries_merge_commit_idx")
      .on(t.organizationId, t.repoId, t.mergeCommitSha)
      .where(sql`${t.mergeCommitSha} IS NOT NULL`),
    index("github_deliveries_head_sha_idx")
      .on(t.organizationId, t.repoId, t.headSha)
      .where(sql`${t.headSha} IS NOT NULL`),
  ],
)
