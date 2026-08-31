import { type Partner, PartnerRepository, type PartnerScope, partnerSchema } from "@domain/partners"
import { NotFoundError, type PartnerId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, desc, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { decryptField, encryptField, getEncryptionKey } from "../encryption-key.ts"
import { partners } from "../schema/partners.ts"

/**
 * SECURITY: `latitude.partners` is a global staff-managed table — no
 * `organization_id`, no RLS policy — so none of these queries carry an org
 * predicate. Reads are reachable from the runtime connection because signature
 * verification needs them on every partner request. Every write path must be
 * given the admin client (backoffice server fns, per
 * `.agents/skills/backoffice/SKILL.md`); nothing on the request path writes.
 */

const toDomainPartner = (row: typeof partners.$inferSelect): Partner =>
  partnerSchema.parse({
    id: row.id,
    name: row.name,
    iconUrl: row.iconUrl,
    redirectUrls: row.redirectUrls,
    scopes: row.scopes,
    allowedIps: row.allowedIps,
    enabled: row.enabled,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toInsertRow = (partner: Partner, hmacSecret: string) => ({
  id: partner.id,
  name: partner.name,
  iconUrl: partner.iconUrl,
  redirectUrls: partner.redirectUrls,
  hmacSecret,
  scopes: partner.scopes as readonly PartnerScope[],
  allowedIps: partner.allowedIps,
  enabled: partner.enabled,
  deletedAt: partner.deletedAt,
})

export const PartnerRepositoryLive = Layer.effect(
  PartnerRepository,
  Effect.gen(function* () {
    const encryptionKey = yield* getEncryptionKey()

    const findRowById = (id: PartnerId) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const [row] = yield* sqlClient.query((db) =>
          db
            .select()
            .from(partners)
            .where(and(eq(partners.id, id), isNull(partners.deletedAt)))
            .limit(1),
        )
        if (!row) return yield* new NotFoundError({ entity: "Partner", id })
        return row
      })

    return {
      findById: (id: PartnerId) => findRowById(id).pipe(Effect.map(toDomainPartner)),

      findSecretById: (id: PartnerId) =>
        findRowById(id).pipe(Effect.flatMap((row) => decryptField(row.hmacSecret, encryptionKey, "findSecretById"))),

      list: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db.select().from(partners).where(isNull(partners.deletedAt)).orderBy(desc(partners.createdAt)),
          )
          return rows.map(toDomainPartner)
        }),

      save: (partner: Partner, options?: { readonly hmacSecret?: string }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // An upsert without a secret would have to invent a ciphertext for the insert branch, so the
          // no-secret call is an UPDATE: the only caller that creates a partner always supplies one.
          if (options?.hmacSecret === undefined) {
            // `deletedAt IS NULL` is what stops a delete that commits mid-edit from being
            // undone: the entity in hand was read live, so writing it back unconditionally
            // would restore `deletedAt: null` and re-arm the partner's signing secret.
            const updated = yield* sqlClient.query((db) =>
              db
                .update(partners)
                .set({
                  name: partner.name,
                  iconUrl: partner.iconUrl,
                  redirectUrls: partner.redirectUrls,
                  scopes: partner.scopes as readonly PartnerScope[],
                  allowedIps: partner.allowedIps,
                  enabled: partner.enabled,
                  updatedAt: new Date(),
                })
                .where(and(eq(partners.id, partner.id), isNull(partners.deletedAt)))
                .returning({ id: partners.id }),
            )
            if (updated.length === 0) return yield* new NotFoundError({ entity: "Partner", id: partner.id })
            return
          }

          const hmacSecret = yield* encryptField(options.hmacSecret, encryptionKey, "save")
          const row = toInsertRow(partner, hmacSecret)
          const written = yield* sqlClient.query((db) =>
            db
              .insert(partners)
              .values(row)
              .onConflictDoUpdate({
                target: partners.id,
                set: {
                  name: row.name,
                  iconUrl: row.iconUrl,
                  redirectUrls: row.redirectUrls,
                  hmacSecret: row.hmacSecret,
                  scopes: row.scopes,
                  allowedIps: row.allowedIps,
                  enabled: row.enabled,
                  updatedAt: new Date(),
                },
                setWhere: isNull(partners.deletedAt),
              })
              .returning({ id: partners.id }),
          )
          // Rotation onto a partner deleted mid-flight hits the conflict branch, is filtered
          // out by `setWhere`, and returns nothing — the same not-found a fresh read would give.
          if (written.length === 0) return yield* new NotFoundError({ entity: "Partner", id: partner.id })
        }),

      softDelete: (id: PartnerId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const deleted = yield* sqlClient.query((db) =>
            db
              .update(partners)
              .set({ deletedAt: new Date(), updatedAt: new Date() })
              .where(and(eq(partners.id, id), isNull(partners.deletedAt)))
              .returning({ id: partners.id }),
          )
          if (deleted.length === 0) return yield* new NotFoundError({ entity: "Partner", id })
        }),
    }
  }),
)
