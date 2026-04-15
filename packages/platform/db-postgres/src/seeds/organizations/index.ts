import { createMembership, createOrganization } from "@domain/organizations"
import {
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_MEMBERSHIP_ID,
  SEED_ADMIN_USER_ID,
  SEED_MEMBER_1_EMAIL,
  SEED_MEMBER_1_MEMBERSHIP_ID,
  SEED_MEMBER_1_USER_ID,
  SEED_MEMBER_2_EMAIL,
  SEED_MEMBER_2_MEMBERSHIP_ID,
  SEED_MEMBER_2_USER_ID,
  SEED_MEMBER_3_EMAIL,
  SEED_MEMBER_3_MEMBERSHIP_ID,
  SEED_MEMBER_3_USER_ID,
  SEED_MEMBER_4_EMAIL,
  SEED_MEMBER_4_MEMBERSHIP_ID,
  SEED_MEMBER_4_USER_ID,
  SEED_MEMBER_5_EMAIL,
  SEED_MEMBER_5_MEMBERSHIP_ID,
  SEED_MEMBER_5_USER_ID,
  SEED_ORG_ID,
  SEED_ORG_NAME,
  SEED_ORG_SLUG,
  SEED_OWNER_EMAIL,
  SEED_OWNER_MEMBERSHIP_ID,
  SEED_OWNER_USER_ID,
} from "@domain/shared/seeding"
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
          {
            id: SEED_MEMBER_1_USER_ID,
            email: SEED_MEMBER_1_EMAIL,
            name: "Alex Rivera",
            emailVerified: true,
            role: "user" as const,
          },
          {
            id: SEED_MEMBER_2_USER_ID,
            email: SEED_MEMBER_2_EMAIL,
            name: "Blake Chen",
            emailVerified: true,
            role: "user" as const,
          },
          {
            id: SEED_MEMBER_3_USER_ID,
            email: SEED_MEMBER_3_EMAIL,
            name: "Casey Diaz",
            emailVerified: true,
            role: "user" as const,
          },
          {
            id: SEED_MEMBER_4_USER_ID,
            email: SEED_MEMBER_4_EMAIL,
            name: "Dana Evans",
            emailVerified: true,
            role: "user" as const,
          },
          {
            id: SEED_MEMBER_5_USER_ID,
            email: SEED_MEMBER_5_EMAIL,
            name: "Eli Foster",
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

      const memberSeeds = [
        { id: SEED_MEMBER_1_MEMBERSHIP_ID, userId: SEED_MEMBER_1_USER_ID },
        { id: SEED_MEMBER_2_MEMBERSHIP_ID, userId: SEED_MEMBER_2_USER_ID },
        { id: SEED_MEMBER_3_MEMBERSHIP_ID, userId: SEED_MEMBER_3_USER_ID },
        { id: SEED_MEMBER_4_MEMBERSHIP_ID, userId: SEED_MEMBER_4_USER_ID },
        { id: SEED_MEMBER_5_MEMBERSHIP_ID, userId: SEED_MEMBER_5_USER_ID },
      ] as const
      for (const m of memberSeeds) {
        const membership = createMembership({
          id: m.id,
          organizationId: SEED_ORG_ID,
          userId: m.userId,
          role: "member",
        })
        yield* ctx.repositories.membership.save(membership)
      }

      console.log("  -> memberships: owner + admin + 5 members (alex, blake, casey, dana, eli @ acme.com)")
    }),
}

export const organizationSeeders: readonly Seeder[] = [seedUsers, seedOrganizations, seedMemberships]
