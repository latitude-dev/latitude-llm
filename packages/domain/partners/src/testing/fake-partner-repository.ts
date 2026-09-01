import { NotFoundError, type PartnerId } from "@domain/shared"
import { Effect } from "effect"
import type { Partner } from "../entities/partner.ts"
import type { PartnerRepository } from "../ports/partner-repository.ts"

type PartnerRepositoryShape = (typeof PartnerRepository)["Service"]

export const createFakePartnerRepository = (overrides?: Partial<PartnerRepositoryShape>) => {
  const partners = new Map<PartnerId, Partner>()
  const secrets = new Map<PartnerId, string>()

  const findLive = (id: PartnerId): Partner | undefined => {
    const partner = partners.get(id)
    return partner && partner.deletedAt === null ? partner : undefined
  }

  const repository: PartnerRepositoryShape = {
    findById: (id) => {
      const partner = findLive(id)
      if (!partner) return Effect.fail(new NotFoundError({ entity: "Partner", id }))
      return Effect.succeed(partner)
    },

    findSecretById: (id) => {
      const partner = findLive(id)
      const secret = secrets.get(id)
      if (!partner || secret === undefined) return Effect.fail(new NotFoundError({ entity: "Partner", id }))
      return Effect.succeed(secret)
    },

    list: () =>
      Effect.succeed(
        [...partners.values()]
          .filter((partner) => partner.deletedAt === null)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),

    save: (partner, options) => {
      // Mirrors the adapter: a row soft-deleted since the caller read it stays deleted.
      if (partners.get(partner.id)?.deletedAt) {
        return Effect.fail(new NotFoundError({ entity: "Partner", id: partner.id }))
      }
      return Effect.sync(() => {
        partners.set(partner.id, partner)
        if (options?.hmacSecret !== undefined) secrets.set(partner.id, options.hmacSecret)
      })
    },

    softDelete: (id) => {
      const partner = findLive(id)
      if (!partner) return Effect.fail(new NotFoundError({ entity: "Partner", id }))
      return Effect.sync(() => {
        partners.set(id, { ...partner, deletedAt: new Date() })
      })
    },

    ...overrides,
  }

  return { repository, partners, secrets }
}
