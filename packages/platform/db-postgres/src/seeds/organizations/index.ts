import { createMembership, createOrganization } from "@domain/organizations"
import { OrganizationId, UserId } from "@domain/shared"
import { Effect } from "effect"
import { postgresSchema } from "../../index.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

export const SEED_OWNER_USER_ID = UserId("ye9d77pxi50nh1gyqljkffnb")
const SEED_ADMIN_USER_ID = UserId("uzm4d8pb5k0bd2oug9ud2xjs")
export const SEED_ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")
const SEED_OWNER_MEMBERSHIP_ID = "bg5hvjzpeop0atmz2nqydas7"
const SEED_ADMIN_MEMBERSHIP_ID = "h5q2nionpzqmzvkgp0sp7jnl"
const SEED_OWNER_EMAIL = "owner@acme.com"
const SEED_ADMIN_EMAIL = "admin@acme.com"
const SEED_ORG_NAME = "Acme Inc."
const SEED_ORG_SLUG = "acme"

const seedUsers: Seeder = {
  name: "organizations/users",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const users = [
          {
            id: SEED_OWNER_USER_ID,
            email: SEED_OWNER_EMAIL,
            name: "Owner User",
            emailVerified: true,
            role: "admin" as const,
          },
          {
            id: SEED_ADMIN_USER_ID,
            email: SEED_ADMIN_EMAIL,
            name: "Admin User",
            emailVerified: true,
            role: "user" as const,
          },
        ]
        for (const u of users) {
          await ctx.db
            .insert(postgresSchema.user)
            .values(u)
            .onConflictDoUpdate({
              target: postgresSchema.user.id,
              set: {
                email: u.email,
                name: u.name,
                emailVerified: u.emailVerified,
                role: u.role,
              },
            })
        }

        console.log(`  -> users: ${users.map((user) => user.email).join(", ")}`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed users", cause: error }),
    }).pipe(Effect.asVoid),
}

const seedOrganizations: Seeder = {
  name: "organizations/organizations",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const org = createOrganization({
        id: SEED_ORG_ID,
        name: SEED_ORG_NAME,
        slug: SEED_ORG_SLUG,
        creatorId: SEED_OWNER_USER_ID,
      })
      yield* ctx.repositories.organization.save(org)
      console.log(`  -> organization: ${org.name} (${org.slug})`)
    }),
}

const seedMemberships: Seeder = {
  name: "organizations/memberships",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const ownerMembership = createMembership({
        id: SEED_OWNER_MEMBERSHIP_ID,
        organizationId: SEED_ORG_ID,
        userId: SEED_OWNER_USER_ID,
        role: "owner",
      })
      yield* ctx.repositories.membership.save(ownerMembership)

      const adminMembership = createMembership({
        id: SEED_ADMIN_MEMBERSHIP_ID,
        organizationId: SEED_ORG_ID,
        userId: SEED_ADMIN_USER_ID,
        role: "admin",
      })
      yield* ctx.repositories.membership.save(adminMembership)

      console.log("  -> memberships: owner@acme.com (owner), admin@acme.com (admin)")
    }),
}

export const organizationSeeders: readonly Seeder[] = [seedUsers, seedOrganizations, seedMemberships]
