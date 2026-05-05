import { type BillingOverride, BillingOverrideRepository } from "@domain/billing"
import {
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { billingOverrides } from "../schema/billing.ts"

const toDomain = (row: typeof billingOverrides.$inferSelect): BillingOverride => ({
  id: row.id,
  organizationId: OrganizationId(row.organizationId),
  plan: row.plan as BillingOverride["plan"],
  includedCredits: row.includedCredits ?? null,
  retentionDays: row.retentionDays ?? null,
  notes: row.notes ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const BillingOverrideRepositoryLive = Layer.effect(
  BillingOverrideRepository,
  Effect.gen(function* () {
    return {
      findByOrganizationId: (organizationId: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [result] = yield* sqlClient.query((db) =>
            db.select().from(billingOverrides).where(eq(billingOverrides.organizationId, organizationId)).limit(1),
          )
          return result ? toDomain(result) : null
        }),

      upsert: (override: BillingOverride) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .insert(billingOverrides)
              .values({
                id: override.id,
                organizationId: override.organizationId,
                plan: override.plan,
                includedCredits: override.includedCredits,
                retentionDays: override.retentionDays,
                notes: override.notes,
                createdAt: override.createdAt,
                updatedAt: override.updatedAt,
              })
              .onConflictDoUpdate({
                target: billingOverrides.organizationId,
                set: {
                  plan: override.plan,
                  includedCredits: override.includedCredits,
                  retentionDays: override.retentionDays,
                  notes: override.notes,
                  updatedAt: new Date(),
                },
              }),
          )
        }),

      deleteByOrganizationId: (organizationId: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db.delete(billingOverrides).where(eq(billingOverrides.organizationId, organizationId)),
          )
        }),
    }
  }),
)
