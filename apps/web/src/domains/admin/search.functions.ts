import {
  MAX_SEARCH_QUERY_LENGTH,
  searchEntityTypeSchema,
  type UnifiedSearchResult,
  unifiedSearchUseCase,
} from "@domain/admin"
import { withPostgres } from "@platform/db-postgres"
import { AdminSearchRepositoryLive } from "@platform/db-postgres/admin-search"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"

/**
 * Serialisable DTOs for the backoffice search UI. Dates are stringified so
 * the payload can cross the TanStack Start RPC boundary as JSON.
 */
export interface AdminUserMembershipDto {
  organizationId: string
  organizationName: string
  organizationSlug: string
}

export interface AdminUserSearchDto {
  type: "user"
  id: string
  email: string
  name: string | null
  image: string | null
  role: "user" | "admin"
  memberships: AdminUserMembershipDto[]
  createdAt: string
}

export interface AdminOrganizationSearchDto {
  type: "organization"
  id: string
  name: string
  slug: string
  createdAt: string
}

export interface AdminProjectSearchDto {
  type: "project"
  id: string
  name: string
  slug: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  createdAt: string
}

export interface AdminSearchDto {
  users: AdminUserSearchDto[]
  organizations: AdminOrganizationSearchDto[]
  projects: AdminProjectSearchDto[]
}

const toDto = (result: UnifiedSearchResult): AdminSearchDto => ({
  users: result.users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
  organizations: result.organizations.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
  projects: result.projects.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
})

/**
 * Exported so tests can exercise input validation without spinning up the
 * server-function RPC runtime. The admin guard itself is covered by unit
 * tests in `admin-auth.test.ts`.
 */
export const adminSearchInputSchema = z.object({
  q: z.string().max(MAX_SEARCH_QUERY_LENGTH),
  type: searchEntityTypeSchema.default("all"),
})

/**
 * Backoffice unified search server function.
 *
 * Guard: {@link adminMiddleware} runs before the input validator and
 * rejects non-admins with a `NotFoundError` identical to hitting a
 * non-existent server function. Admin queries then use
 * {@link getAdminPostgresClient} + `withPostgres` at the default
 * `OrganizationId("system")` scope, which is the only sanctioned
 * RLS-bypass signal in the codebase.
 */
export const adminSearch = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminSearchInputSchema)
  .handler(async ({ data }): Promise<AdminSearchDto> => {
    const client = getAdminPostgresClient()

    const result = await Effect.runPromise(
      unifiedSearchUseCase({ query: data.q, entityType: data.type }).pipe(
        withPostgres(AdminSearchRepositoryLive, client),
        withTracing,
      ),
    )

    return toDto(result)
  })
