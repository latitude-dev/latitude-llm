import {
  type AdminOrganizationDetails,
  type AdminOrganizationMember,
  type AdminOrganizationProject,
  AdminOrganizationRepository,
  type AdminOrganizationSummary,
} from "@domain/admin"
import { NotFoundError, OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { members, organizations, subscriptions, users } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"

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

          const projectDtos: AdminOrganizationProject[] = projectRows.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            createdAt: r.createdAt,
          }))

          const details: AdminOrganizationDetails = {
            id: orgRow.id,
            name: orgRow.name,
            slug: orgRow.slug,
            stripeCustomerId: orgRow.stripeCustomerId ?? null,
            members: memberDtos,
            projects: projectDtos,
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
              .where(inArray(organizations.id, idList)),
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
              .orderBy(desc(subscriptions.periodStart), desc(subscriptions.id)),
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
    }
  }),
)
