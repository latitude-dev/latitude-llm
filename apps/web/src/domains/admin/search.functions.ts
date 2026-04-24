import {
  MAX_SEARCH_QUERY_LENGTH,
  searchEntityTypeSchema,
  type UnifiedSearchResult,
  unifiedSearchUseCase,
} from "@domain/admin"
import { AdminSearchRepositoryLive } from "@platform/db-postgres"
import { z } from "zod"
import { createAdminServerFn } from "../../server/admin-server-fn.ts"

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
 * server-function RPC runtime. The admin guard is covered by
 * `createAdminServerFn` (tested separately in `admin-auth.test.ts`).
 */
export const adminSearchInputSchema = z.object({
  q: z.string().max(MAX_SEARCH_QUERY_LENGTH),
  type: searchEntityTypeSchema.default("all"),
})

export const adminSearch = createAdminServerFn({
  method: "GET",
  input: adminSearchInputSchema,
  layer: AdminSearchRepositoryLive,
  run: (input) => unifiedSearchUseCase({ query: input.q, entityType: input.type }),
  toDto,
})
