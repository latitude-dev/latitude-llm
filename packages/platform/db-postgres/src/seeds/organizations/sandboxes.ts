import { createMembership, createOrganization } from "@domain/organizations"
import { createProject } from "@domain/projects"
import {
  SEED_ACME_SANDBOX_ACTIVE_ATTRS_ID,
  SEED_ACME_SANDBOX_ACTIVE_NAME,
  SEED_ACME_SANDBOX_ACTIVE_ORG_ID,
  SEED_ACME_SANDBOX_ACTIVE_PROJECT_ID,
  SEED_ACME_SANDBOX_ACTIVE_SLUG,
  SEED_ACME_SANDBOX_ARCHIVED_ATTRS_ID,
  SEED_ACME_SANDBOX_ARCHIVED_NAME,
  SEED_ACME_SANDBOX_ARCHIVED_ORG_ID,
  SEED_ACME_SANDBOX_ARCHIVED_PROJECT_ID,
  SEED_ACME_SANDBOX_ARCHIVED_SLUG,
  SEED_BETA_MEMBER_EMAIL,
  SEED_BETA_MEMBER_MEMBERSHIP_ID,
  SEED_BETA_MEMBER_USER_ID,
  SEED_BETA_ORG_ID,
  SEED_BETA_ORG_NAME,
  SEED_BETA_ORG_SLUG,
  SEED_BETA_OWNER_EMAIL,
  SEED_BETA_OWNER_MEMBERSHIP_ID,
  SEED_BETA_OWNER_USER_ID,
  SEED_BETA_PROJECT_ID,
  SEED_BETA_PROJECT_NAME,
  SEED_BETA_PROJECT_SLUG,
  SEED_ORG_ID,
  SEED_OWNER_USER_ID,
  SEED_PROJECT_ID,
} from "@domain/shared/seeding"
import { Effect } from "effect"
import { users as usersTable } from "../../schema/better-auth.ts"
import { projects as projectsTable } from "../../schema/projects.ts"
import { sandboxes as sandboxesTable } from "../../schema/sandboxes.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

/**
 * Second top-level org for Test Mode QA. No sandboxes — exercises the
 * empty-state / "create your first sandbox" branch of the Wave 2 UI.
 */
const seedBetaOrganization: Seeder = {
  name: "organizations/beta-organization",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: async () => {
          const betaUsers = [
            {
              id: SEED_BETA_OWNER_USER_ID,
              email: SEED_BETA_OWNER_EMAIL,
              name: "Beta Owner",
              emailVerified: true,
              role: "user" as const,
            },
            {
              id: SEED_BETA_MEMBER_USER_ID,
              email: SEED_BETA_MEMBER_EMAIL,
              name: "Alex (Beta)",
              emailVerified: true,
              role: "user" as const,
            },
          ]
          for (const u of betaUsers) {
            await ctx.db
              .insert(usersTable)
              .values(u)
              .onConflictDoUpdate({
                target: usersTable.id,
                set: { email: u.email, name: u.name, emailVerified: u.emailVerified, role: u.role },
              })
          }
        },
        catch: (error) => new SeedError({ reason: "Failed to seed Beta users", cause: error }),
      })

      const org = createOrganization({
        id: SEED_BETA_ORG_ID,
        name: SEED_BETA_ORG_NAME,
        slug: SEED_BETA_ORG_SLUG,
      })
      yield* ctx.repositories.organization.save(org)

      yield* ctx.repositories.membership.save(
        createMembership({
          id: SEED_BETA_OWNER_MEMBERSHIP_ID,
          organizationId: SEED_BETA_ORG_ID,
          userId: SEED_BETA_OWNER_USER_ID,
          role: "owner",
        }),
      )
      yield* ctx.repositories.membership.save(
        createMembership({
          id: SEED_BETA_MEMBER_MEMBERSHIP_ID,
          organizationId: SEED_BETA_ORG_ID,
          userId: SEED_BETA_MEMBER_USER_ID,
          role: "member",
        }),
      )

      const project = createProject({
        id: SEED_BETA_PROJECT_ID,
        organizationId: SEED_BETA_ORG_ID,
        name: SEED_BETA_PROJECT_NAME,
        slug: SEED_BETA_PROJECT_SLUG,
      })
      yield* ctx.repositories.project.save(project)

      console.log(`  -> organization: ${org.name} (${org.slug}) — owner@beta.com, alex@beta.com`)
    }),
}

/**
 * Two sandbox orgs under Acme — one `active`, one `archived` — so Wave 2 UI
 * (switcher / list / settings) demos both lifecycle states. Sandbox orgs are
 * sibling tenants: a real `organizations` row with `parent_org_id = acme.id`,
 * a 1:1 `sandboxes` attrs row, and (per spec) **no `members` rows** — access
 * resolves through the parent's membership via `sandboxMiddleware`.
 *
 * Each sandbox owns one linked sandbox project pointing at an Acme project by
 * stable id (`projects.linked_project_id`). The `linkedProjectId` column is
 * not yet exposed through the domain `Project` entity, so the linked row is
 * inserted directly via the drizzle table.
 */
const seedAcmeSandboxes: Seeder = {
  name: "organizations/acme-sandboxes",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const activeOrg = createOrganization({
        id: SEED_ACME_SANDBOX_ACTIVE_ORG_ID,
        name: SEED_ACME_SANDBOX_ACTIVE_NAME,
        slug: SEED_ACME_SANDBOX_ACTIVE_SLUG,
        parentOrgId: SEED_ORG_ID,
      })
      yield* ctx.repositories.organization.save(activeOrg)

      const archivedOrg = createOrganization({
        id: SEED_ACME_SANDBOX_ARCHIVED_ORG_ID,
        name: SEED_ACME_SANDBOX_ARCHIVED_NAME,
        slug: SEED_ACME_SANDBOX_ARCHIVED_SLUG,
        parentOrgId: SEED_ORG_ID,
      })
      yield* ctx.repositories.organization.save(archivedOrg)

      yield* Effect.tryPromise({
        try: async () => {
          // Both timestamps anchor on `SEED_TIMELINE_ANCHOR` (via the seed
          // scope) so Postgres and ClickHouse seeds agree and re-running
          // `pnpm db:seed` doesn't drift the values.
          const lastActiveAt = ctx.scope.dateDaysAgo(0, 9, 0)
          // 30 days ago — well past the 7-day idle threshold so the
          // archived sandbox surfaces as "asleep" in the UI.
          const archivedSince = ctx.scope.dateDaysAgo(30, 9, 0)

          // Sandbox attrs + linked-project rows use `onConflictDoNothing`
          // (rather than the `onConflictDoUpdate` we use for users) so that
          // local QA tweaks to status / last_activity_at survive a re-seed.
          // User rows are upserted to keep email/name aligned with the seed
          // constants in `@domain/shared/seeding`.
          await ctx.db
            .insert(sandboxesTable)
            .values({
              id: SEED_ACME_SANDBOX_ACTIVE_ATTRS_ID,
              organizationId: SEED_ACME_SANDBOX_ACTIVE_ORG_ID,
              status: "active",
              lastActivityAt: lastActiveAt,
              createdByUserId: SEED_OWNER_USER_ID,
            })
            .onConflictDoNothing({ target: sandboxesTable.organizationId })

          await ctx.db
            .insert(sandboxesTable)
            .values({
              id: SEED_ACME_SANDBOX_ARCHIVED_ATTRS_ID,
              organizationId: SEED_ACME_SANDBOX_ARCHIVED_ORG_ID,
              status: "archived",
              lastActivityAt: archivedSince,
              createdByUserId: SEED_OWNER_USER_ID,
            })
            .onConflictDoNothing({ target: sandboxesTable.organizationId })

          await ctx.db
            .insert(projectsTable)
            .values({
              id: SEED_ACME_SANDBOX_ACTIVE_PROJECT_ID,
              organizationId: SEED_ACME_SANDBOX_ACTIVE_ORG_ID,
              name: "Support Agent",
              slug: "support-agent",
              linkedProjectId: SEED_PROJECT_ID,
            })
            .onConflictDoNothing({ target: projectsTable.id })

          await ctx.db
            .insert(projectsTable)
            .values({
              id: SEED_ACME_SANDBOX_ARCHIVED_PROJECT_ID,
              organizationId: SEED_ACME_SANDBOX_ARCHIVED_ORG_ID,
              name: "Support Agent",
              slug: "support-agent",
              linkedProjectId: SEED_PROJECT_ID,
            })
            .onConflictDoNothing({ target: projectsTable.id })
        },
        catch: (error) => new SeedError({ reason: "Failed to seed Acme sandboxes", cause: error }),
      })

      console.log(`  -> sandboxes (acme): "${activeOrg.name}" [active], "${archivedOrg.name}" [archived]`)
    }),
}

export const sandboxOrganizationSeeders: readonly Seeder[] = [seedBetaOrganization, seedAcmeSandboxes]
