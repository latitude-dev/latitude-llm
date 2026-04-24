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
 * Defence-in-depth note — every backoffice `createServerFn` handler MUST:
 * 1. Call {@link requireAdminSession} as its first line, before any IO.
 *    TanStack Start exposes server functions at stable RPC URLs reachable
 *    by any authenticated user; the route-level `notFound()` guard in
 *    `routes/backoffice/route.tsx` does not protect this layer.
 * 2. Use {@link getAdminPostgresClient} piped through `withPostgres`. The
 *    default organisation scope is `OrganizationId("system")`, which is the
 *    only sanctioned RLS-bypass signal in the codebase.
 *
 * Why no factory wrapper? TanStack Start's Vite plugin recognises
 * `createServerFn(...).handler(inlineFn)` literal chains and replaces the
 * handler body with a client-side RPC stub. A factory that wraps
 * `createServerFn` defeats that detection and leaks Node-only imports
 * (e.g. `withTracing`) into the browser bundle, breaking the build.
 */
export const adminSearch = createServerFn({ method: "GET" })
  .inputValidator(adminSearchInputSchema)
  .handler(async ({ data }): Promise<AdminSearchDto> => {
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
