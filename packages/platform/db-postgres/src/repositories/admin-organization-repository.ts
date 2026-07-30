import {
  type AdminOrganizationCreditSpendRow,
  type AdminOrganizationDetails,
  type AdminOrganizationMember,
  type AdminOrganizationProject,
  AdminOrganizationRepository,
  type AdminOrganizationSandbox,
  type AdminOrganizationSummary,
} from "@domain/admin"
import {
  type ApiKeyId,
  NotFoundError,
  OrganizationId,
  type OrganizationSettings,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { apiKeys } from "../schema/api-keys.ts"
import { members, organizations, subscriptions, users } from "../schema/better-auth.ts"
import { billingUsagePeriods } from "../schema/billing.ts"
import { projects } from "../schema/projects.ts"
import { sandboxes } from "../schema/sandboxes.ts"

type SandboxStatusValue = AdminOrganizationSandbox["status"]

type MemberRoleValue = AdminOrganizationMember["role"]
type UserRoleValue = AdminOrganizationMember["user"]["role"]

/**
 * Live layer for the backoffice org-detail port.
 *
 * ⚠️ SECURITY: queries run **without** an `organization_id` filter and
 * see every org / user / project in the database. Only safe when the
 * SqlClient was constructed with `OrganizationId("system")` (the
 * default on `getAdminPostgresClient()`) so RLS is bypassed. Never
 * provide this layer on the standard app-facing Postgres client.
 *
 * Three sequential queries: org row, members + their users, and
 * non-deleted projects. We could collapse members + projects into
 * parallel calls but the gain is microseconds for a backoffice page;
 * the sequential shape is easier to reason about.
 */
export const AdminOrganizationRepositoryLive = Layer.effect(
  AdminOrganizationRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findById: (organizationId: OrganizationId) =>
        Effect.gen(function* () {
          const orgRows = yield* sqlClient.query((db) =>
            db
              .select({
                id: organizations.id,
                name: organizations.name,
                slug: organizations.slug,
                stripeCustomerId: organizations.stripeCustomerId,
                settings: organizations.settings,
                createdAt: organizations.createdAt,
                updatedAt: organizations.updatedAt,
              })
              .from(organizations)
              .where(eq(organizations.id, organizationId))
              .limit(1),
          )
          const orgRow = orgRows[0]
          if (!orgRow) {
            return yield* Effect.fail(new NotFoundError({ entity: "Organization", id: organizationId }))
          }

          const memberRows = yield* sqlClient.query((db) =>
            db
              .select({
                membershipId: members.id,
                memberRole: members.role,
                userId: users.id,
                userEmail: users.email,
                userName: users.name,
                userImage: users.image,
                userRole: users.role,
              })
              .from(members)
              .innerJoin(users, eq(members.userId, users.id))
              .where(eq(members.organizationId, organizationId))
              .orderBy(users.email),
          )

          const projectRows = yield* sqlClient.query((db) =>
            db
              .select({
                id: projects.id,
                name: projects.name,
                slug: projects.slug,
                createdAt: projects.createdAt,
              })
              .from(projects)
              .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt)))
              .orderBy(projects.name),
          )

          const memberDtos: AdminOrganizationMember[] = memberRows.map((r) => ({
            membershipId: r.membershipId,
            role: r.memberRole as MemberRoleValue,
            user: {
              id: r.userId,
              email: r.userEmail,
              name: r.userName ?? null,
              image: r.userImage ?? null,
              role: r.userRole as UserRoleValue,
            },
          }))

          // Sandboxes (Test Mode) belonging to this org. A sandbox *is* an org
          // (`organizations.parent_org_id = <this org>`), so we join the sandbox
          // attributes row to its own org row for name/slug, plus the creator.
          // All statuses (active + archived) — staff want the full history.
          const sandboxRows = yield* sqlClient.query((db) =>
            db
              .select({
                organizationId: sandboxes.organizationId,
                name: organizations.name,
                slug: organizations.slug,
                status: sandboxes.status,
                lastActivityAt: sandboxes.lastActivityAt,
                createdAt: sandboxes.createdAt,
                ownerId: users.id,
                ownerEmail: users.email,
                ownerName: users.name,
              })
              .from(sandboxes)
              .innerJoin(organizations, eq(organizations.id, sandboxes.organizationId))
              .leftJoin(users, eq(users.id, sandboxes.createdByUserId))
              .where(eq(organizations.parentOrgId, organizationId))
              .orderBy(desc(sandboxes.createdAt)),
          )

          const projectDtos: AdminOrganizationProject[] = projectRows.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            createdAt: r.createdAt,
          }))

          const sandboxDtos: AdminOrganizationSandbox[] = sandboxRows.map((r) => ({
            organizationId: r.organizationId,
            name: r.name,
            slug: r.slug,
            status: r.status as SandboxStatusValue,
            lastActivityAt: r.lastActivityAt,
            owner: r.ownerEmail ? { id: r.ownerId as string, email: r.ownerEmail, name: r.ownerName ?? null } : null,
            createdAt: r.createdAt,
          }))

          const details: AdminOrganizationDetails = {
            id: orgRow.id,
            name: orgRow.name,
            slug: orgRow.slug,
            stripeCustomerId: orgRow.stripeCustomerId ?? null,
            wantsShowcase: (orgRow.settings as OrganizationSettings | null)?.wantsShowcase ?? false,
            members: memberDtos,
            projects: projectDtos,
            sandboxes: sandboxDtos,
            createdAt: orgRow.createdAt,
            updatedAt: orgRow.updatedAt,
          }
          return details
        }),

      findManySummariesByIds: (ids) =>
        Effect.gen(function* () {
          if (ids.length === 0) return new Map<OrganizationId, AdminOrganizationSummary>()

          // Drizzle's inArray expects raw strings; the OrganizationId branded
          // type is structurally a string, but the type checker treats them
          // as distinct without the cast.
          const idList = ids as readonly string[]

          const orgRows = yield* sqlClient.query((db) =>
            db
              .select({
                id: organizations.id,
                name: organizations.name,
                slug: organizations.slug,
                createdAt: organizations.createdAt,
              })
              .from(organizations)
              // Sandbox orgs (Test Mode) carry a `parent_org_id`. They generate
              // traces like any org, so ClickHouse surfaces them in the usage
              // ranking — but they must not appear in the backoffice org listing.
              // Dropping them here means the use-case treats them like a
              // hard-deleted org (id present in CH, absent from the summary map)
              // and silently skips them, with the cursor still anchored on the CH
              // row so pagination doesn't re-fetch them.
              .where(and(inArray(organizations.id, idList), isNull(organizations.parentOrgId))),
          )

          const memberCountRows = yield* sqlClient.query((db) =>
            db
              .select({
                organizationId: members.organizationId,
                count: sql<number>`COUNT(*)::int`,
              })
              .from(members)
              .where(inArray(members.organizationId, idList))
              .groupBy(members.organizationId),
          )

          // Pick the most recent active or trialing subscription per org. We
          // can't use Postgres' `DISTINCT ON` ergonomically through Drizzle,
          // so we order by period_start DESC NULLS LAST + id DESC and take
          // the first row we see for each reference id in JS. There aren't
          // typically multiple concurrent active subs per org, so the result
          // set is small.
          //
          // Postgres `DESC` puts NULLs first by default, so we spell out
          // `NULLS LAST` via raw SQL — otherwise a sub with no period_start
          // (e.g. a freshly-incomplete row that later transitioned to active
          // without Stripe period data) would beat a real recent one and we'd
          // pick the wrong plan.
          const subRows = yield* sqlClient.query((db) =>
            db
              .select({
                referenceId: subscriptions.referenceId,
                plan: subscriptions.plan,
              })
              .from(subscriptions)
              .where(
                and(inArray(subscriptions.referenceId, idList), inArray(subscriptions.status, ["active", "trialing"])),
              )
              .orderBy(sql`${subscriptions.periodStart} DESC NULLS LAST`, desc(subscriptions.id)),
          )

          const memberCountByOrg = new Map<string, number>()
          for (const row of memberCountRows) {
            memberCountByOrg.set(row.organizationId, Number(row.count))
          }

          const planByOrg = new Map<string, string>()
          for (const row of subRows) {
            if (!planByOrg.has(row.referenceId)) {
              planByOrg.set(row.referenceId, row.plan)
            }
          }

          const result = new Map<OrganizationId, AdminOrganizationSummary>()
          for (const row of orgRows) {
            const orgId = OrganizationId(row.id)
            result.set(orgId, {
              id: orgId,
              name: row.name,
              slug: row.slug,
              plan: planByOrg.get(row.id) ?? null,
              memberCount: memberCountByOrg.get(row.id) ?? 0,
              createdAt: row.createdAt,
            })
          }
          return result
        }),

      listByConsumedCredits: ({ now, cursor, limit }) =>
        Effect.gen(function* () {
          // One current-period row per org (earliest period_start wins if
          // overlapping rows exist — same tie-break as findOptionalCurrent),
          // then drop zero-spend rows in the outer query so the DISTINCT ON
          // pick is not skewed by the spend filter. Sandbox orgs are excluded
          // here so they never consume a page slot.
          const ranked = yield* sqlClient.query((db) => {
            const currentPeriods = db
              .selectDistinctOn([billingUsagePeriods.organizationId], {
                organizationId: billingUsagePeriods.organizationId,
                consumedCredits: billingUsagePeriods.consumedCredits,
              })
              .from(billingUsagePeriods)
              .innerJoin(organizations, eq(organizations.id, billingUsagePeriods.organizationId))
              .where(
                and(
                  lte(billingUsagePeriods.periodStart, now),
                  gt(billingUsagePeriods.periodEnd, now),
                  isNull(organizations.parentOrgId),
                ),
              )
              .orderBy(billingUsagePeriods.organizationId, asc(billingUsagePeriods.periodStart))
              .as("current_periods")

            const spendFilter = gt(currentPeriods.consumedCredits, 0)
            const cursorFilter = cursor
              ? sql`(
                    ${currentPeriods.consumedCredits} < ${cursor.consumedCredits}
                    OR (
                      ${currentPeriods.consumedCredits} = ${cursor.consumedCredits}
                      AND ${currentPeriods.organizationId} > ${cursor.organizationId}
                    )
                  )`
              : undefined

            return db
              .select({
                organizationId: currentPeriods.organizationId,
                consumedCredits: currentPeriods.consumedCredits,
              })
              .from(currentPeriods)
              .where(cursorFilter ? and(spendFilter, cursorFilter) : spendFilter)
              .orderBy(desc(currentPeriods.consumedCredits), asc(currentPeriods.organizationId))
              .limit(limit + 1)
          })

          const hasMore = ranked.length > limit
          const pageRows = hasMore ? ranked.slice(0, limit) : ranked
          const rows: AdminOrganizationCreditSpendRow[] = pageRows.map((row) => ({
            organizationId: OrganizationId(row.organizationId),
            consumedCredits: Number(row.consumedCredits),
          }))
          return { rows, hasMore }
        }),

      findFirstApiKeyId: (organizationId: OrganizationId) =>
        Effect.gen(function* () {
          // Order by `createdAt asc` so the org's default key (the one
          // automatically created by the `OrganizationCreated` outbox
          // worker chain at org-setup time) wins over any keys staff
          // generated later. `null` for the degenerate "no keys" case
          // — the use-case fails loudly rather than silently seeding
          // spans with an empty `api_key_id`.
          const rows = yield* sqlClient.query((db) =>
            db
              .select({ id: apiKeys.id })
              .from(apiKeys)
              .where(and(eq(apiKeys.organizationId, organizationId), isNull(apiKeys.deletedAt)))
              .orderBy(asc(apiKeys.createdAt))
              .limit(1),
          )
          return rows[0]?.id ?? null
        }) as Effect.Effect<ApiKeyId | null, never>,

      setWantsShowcase: (organizationId: OrganizationId, enabled: boolean) =>
        Effect.gen(function* () {
          const rows = yield* sqlClient.query((db) =>
            db
              .select({ settings: organizations.settings })
              .from(organizations)
              .where(eq(organizations.id, organizationId))
              .limit(1),
          )
          const row = rows[0]
          if (!row) {
            return yield* Effect.fail(new NotFoundError({ entity: "Organization", id: organizationId }))
          }

          const nextSettings: OrganizationSettings = {
            ...((row.settings as OrganizationSettings | null) ?? {}),
            wantsShowcase: enabled,
          }

          yield* sqlClient.query((db) =>
            db
              .update(organizations)
              .set({ settings: nextSettings, updatedAt: new Date() })
              .where(eq(organizations.id, organizationId)),
          )
        }),
    }
  }),
)
