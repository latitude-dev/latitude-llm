import { type OrganizationClaim, OrganizationClaimRepository, organizationClaimSchema } from "@domain/organizations"
import { OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { organizationClaims } from "../schema/organization-claims.ts"

const toInsertRow = (claim: OrganizationClaim): typeof organizationClaims.$inferInsert => ({
  id: claim.id,
  organizationId: claim.organizationId,
  tokenHash: claim.tokenHash,
  email: claim.email,
  expiresAt: claim.expiresAt,
  claimedAt: claim.claimedAt,
})

const toDomainClaim = (row: typeof organizationClaims.$inferSelect): OrganizationClaim =>
  organizationClaimSchema.parse({
    id: row.id,
    organizationId: OrganizationId(row.organizationId),
    tokenHash: row.tokenHash,
    email: row.email,
    expiresAt: row.expiresAt,
    claimedAt: row.claimedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

// `save` writes the RLS-context org id (bootstrap runs under the admin client scoped to the new org).
export const OrganizationClaimRepositoryLive = Layer.effect(
  OrganizationClaimRepository,
  Effect.gen(function* () {
    return {
      save: (claim: OrganizationClaim) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db.insert(organizationClaims).values({ ...toInsertRow(claim), organizationId }),
          )
        }),

      // Cross-org lookup on the admin client — no org context exists at claim-redemption time.
      findByTokenHash: (tokenHash: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db.select().from(organizationClaims).where(eq(organizationClaims.tokenHash, tokenHash)).limit(1),
          )
          return rows.length > 0 ? toDomainClaim(rows[0] as typeof organizationClaims.$inferSelect) : null
        }),

      findByTokenHashForUpdate: (tokenHash: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(organizationClaims)
              .where(eq(organizationClaims.tokenHash, tokenHash))
              .limit(1)
              .for("update"),
          )
          return rows.length > 0 ? toDomainClaim(rows[0] as typeof organizationClaims.$inferSelect) : null
        }),

      markClaimed: (id: string, claimedAt: Date) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .update(organizationClaims)
              .set({ claimedAt, updatedAt: new Date() })
              .where(eq(organizationClaims.id, id)),
          )
        }),
    }
  }),
)
