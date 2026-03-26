import { createMembership, createOrganization } from "@domain/organizations"
import {
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_MEMBERSHIP_ID,
  SEED_ADMIN_USER_ID,
  SEED_ORG_ID,
  SEED_ORG_NAME,
  SEED_ORG_SLUG,
  SEED_OWNER_EMAIL,
  SEED_OWNER_MEMBERSHIP_ID,
  SEED_OWNER_USER_ID,
} from "@domain/shared"
import { Effect } from "effect"
import { users as usersTable } from "../../schema/better-auth.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const seedUsers: Seeder = {
  name: "organizations/users",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const seedUsers = [
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
        for (const u of seedUsers) {
          await ctx.db
            .insert(usersTable)
            .values(u)
            .onConflictDoUpdate({
              target: usersTable.id,
              set: {
                email: u.email,
                name: u.name,
                emailVerified: u.emailVerified,
                role: u.role,
              },
            })
        }

        console.log(`  -> users: ${seedUsers.map((u) => u.email).join(", ")}`)
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
