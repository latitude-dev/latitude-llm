import {
  MAX_SEARCH_QUERY_LENGTH,
  searchEntityTypeSchema,
  type UnifiedSearchResult,
  unifiedSearchUseCase,
} from "@domain/admin"
import { AdminSearchRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireAdminSession } from "../../server/admin-auth.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"

/**
 * Serialisable DTOs for the backoffice search UI. Dates are stringified so
 * the payload can cross the TanStack Start RPC boundary as JSON.
 */
export interface AdminUserSearchDto {
  type: "user"
  id: string
  email: string
  name: string | null
  role: "user" | "admin"
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
 * server-function RPC runtime. The handler itself is guarded by
 * `requireAdminSession` (unit-tested separately in `admin-auth.test.ts`).
 */
export const adminSearchInputSchema = z.object({
  q: z.string().max(MAX_SEARCH_QUERY_LENGTH),
  type: searchEntityTypeSchema.default("all"),
})

export const adminSearch = createServerFn({ method: "GET" })
  .inputValidator(adminSearchInputSchema)
  .handler(async ({ data }): Promise<AdminSearchDto> => {
    // GUARD — must be first, before any IO. Non-admins get NotFoundError,
    // which surfaces identically to hitting a non-existent server function.
    await requireAdminSession()

    const client = getAdminPostgresClient()

    const result = await Effect.runPromise(
      unifiedSearchUseCase({ query: data.q, entityType: data.type }).pipe(
        withPostgres(AdminSearchRepositoryLive, client),
        withTracing,
      ),
    )

    return toDto(result)
  })
