import { type AdminProjectDetails, AdminProjectRepository } from "@domain/admin"
import { NotFoundError, type ProjectId, type ProjectSettings, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { organizations } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"

/**
 * Live layer for the backoffice project-detail port.
 *
 * ⚠️ SECURITY: queries run **without** an `organization_id` filter and
 * see every project in the database. Only safe when the SqlClient was
 * constructed with `OrganizationId("system")` (the default on
 * `getAdminPostgresClient()`) so RLS is bypassed. Never provide this
 * layer on the standard app-facing Postgres client.
 *
 * Soft-deleted projects (`deletedAt IS NOT NULL`) are excluded — the
 * backoffice deliberately doesn't surface them in v1, matching the
 * search-results filter. If staff need to inspect a deleted project,
 * we'll either restore it or add an explicit toggle later.
 */
export const AdminProjectRepositoryLive = Layer.effect(
  AdminProjectRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findById: (projectId: ProjectId) =>
        Effect.gen(function* () {
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                id: projects.id,
                name: projects.name,
                slug: projects.slug,
                settings: projects.settings,
                firstTraceAt: projects.firstTraceAt,
                lastEditedAt: projects.lastEditedAt,
                deletedAt: projects.deletedAt,
                createdAt: projects.createdAt,
                updatedAt: projects.updatedAt,
                organizationId: organizations.id,
                organizationName: organizations.name,
                organizationSlug: organizations.slug,
              })
              .from(projects)
              .innerJoin(organizations, eq(projects.organizationId, organizations.id))
              .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
              .limit(1),
          )
          const row = rows[0]
          if (!row) {
            return yield* Effect.fail(new NotFoundError({ entity: "Project", id: projectId }))
          }

          const details: AdminProjectDetails = {
            id: row.id,
            name: row.name,
            slug: row.slug,
            organization: {
              id: row.organizationId,
              name: row.organizationName,
              slug: row.organizationSlug,
            },
            settings: (row.settings as ProjectSettings | null) ?? null,
            firstTraceAt: row.firstTraceAt,
            lastEditedAt: row.lastEditedAt,
            deletedAt: row.deletedAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }
          return details
        }),
    }
  }),
)
