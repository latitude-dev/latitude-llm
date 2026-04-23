import { AdminSearchRepository, type UnifiedSearchResult } from "@domain/admin"
import { SqlClient, type SqlClientShape } from "@domain/shared"
import { ilike, isNull, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { organizations, users } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"

const MAX_RESULTS_PER_ENTITY = 10

const buildLikePattern = (query: string): string => `%${query}%`

/**
 * Live layer for the backoffice search port.
 *
 * ⚠️ SECURITY: queries run **without** an `organization_id` filter. This is
 * only safe when the SqlClient was constructed with `OrganizationId("system")`
 * so RLS is bypassed — i.e. when wired via `getAdminPostgresClient()` from a
 * handler that has called `requireAdminSession()`. Never provide this layer
 * on the standard app-facing Postgres client.
 */
export const AdminSearchRepositoryLive = Layer.effect(
  AdminSearchRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      unifiedSearch: (query, entityType) =>
        Effect.gen(function* () {
          const pattern = buildLikePattern(query)

          const wantUsers = entityType === "all" || entityType === "user"
          const wantOrgs = entityType === "all" || entityType === "organization"
          const wantProjects = entityType === "all" || entityType === "project"

          const userRows = wantUsers
            ? yield* sqlClient.query((db) =>
                db
                  .select({
                    id: users.id,
                    email: users.email,
                    name: users.name,
                    role: users.role,
                    createdAt: users.createdAt,
                  })
                  .from(users)
                  .where(or(ilike(users.email, pattern), ilike(users.name, pattern)))
                  .orderBy(users.email)
                  .limit(MAX_RESULTS_PER_ENTITY),
              )
            : []

          const orgRows = wantOrgs
            ? yield* sqlClient.query((db) =>
                db
                  .select({
                    id: organizations.id,
                    name: organizations.name,
                    slug: organizations.slug,
                    createdAt: organizations.createdAt,
                  })
                  .from(organizations)
                  .where(
                    or(
                      ilike(organizations.name, pattern),
                      ilike(organizations.slug, pattern),
                      ilike(sql`CAST(${organizations.id} AS TEXT)`, pattern),
                    ),
                  )
                  .orderBy(organizations.name)
                  .limit(MAX_RESULTS_PER_ENTITY),
              )
            : []

          const projectRows = wantProjects
            ? yield* sqlClient.query((db) =>
                db
                  .select({
                    id: projects.id,
                    name: projects.name,
                    slug: projects.slug,
                    organizationId: projects.organizationId,
                    createdAt: projects.createdAt,
                  })
                  .from(projects)
                  .where(
                    sql`${isNull(projects.deletedAt)} AND (${ilike(projects.name, pattern)} OR ${ilike(projects.slug, pattern)} OR ${ilike(sql`CAST(${projects.id} AS TEXT)`, pattern)})`,
                  )
                  .orderBy(projects.name)
                  .limit(MAX_RESULTS_PER_ENTITY),
              )
            : []

          const result: UnifiedSearchResult = {
            users: userRows.map((r) => ({
              type: "user" as const,
              id: r.id,
              email: r.email,
              name: r.name ?? null,
              role: r.role,
              createdAt: r.createdAt,
            })),
            organizations: orgRows.map((r) => ({
              type: "organization" as const,
              id: r.id,
              name: r.name,
              slug: r.slug,
              createdAt: r.createdAt,
            })),
            projects: projectRows.map((r) => ({
              type: "project" as const,
              id: r.id,
              name: r.name,
              slug: r.slug,
              organizationId: r.organizationId,
              createdAt: r.createdAt,
            })),
          }

          return result
        }),
    }
  }),
)
