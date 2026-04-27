import { type AdminUserDetails, type AdminUserMembership, getUserDetailsUseCase } from "@domain/admin"
import { UserId } from "@domain/shared"
import { AdminUserRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"

export interface AdminUserDetailsMembershipDto {
  organizationId: string
  organizationName: string
  organizationSlug: string
  role: "owner" | "admin" | "member"
}

export interface AdminUserDetailsDto {
  id: string
  email: string
  name: string | null
  image: string | null
  role: "user" | "admin"
  memberships: AdminUserDetailsMembershipDto[]
  createdAt: string
}

const toDto = (details: AdminUserDetails): AdminUserDetailsDto => ({
  id: details.id,
  email: details.email,
  name: details.name,
  image: details.image,
  role: details.role,
  memberships: details.memberships.map(
    (m: AdminUserMembership): AdminUserDetailsMembershipDto => ({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      organizationSlug: m.organizationSlug,
      role: m.role,
    }),
  ),
  createdAt: details.createdAt.toISOString(),
})

/**
 * Exported so tests can exercise input validation without spinning up the
 * server-function RPC runtime. The admin guard itself is covered by unit
 * tests in `admin-auth.test.ts`.
 */
export const adminGetUserInputSchema = z.object({
  userId: z.string().min(1).max(256),
})

/**
 * Backoffice user-detail fetch.
 *
 * Guard: {@link adminMiddleware} runs before the input validator and
 * rejects non-admins with `NotFoundError` (identical to hitting a
 * non-existent server function). Queries use
 * {@link getAdminPostgresClient} + `withPostgres` at the default
 * `OrganizationId("system")` scope — the only sanctioned RLS-bypass
 * signal.
 */
export const adminGetUser = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminGetUserInputSchema)
  .handler(async ({ data }): Promise<AdminUserDetailsDto> => {
    const client = getAdminPostgresClient()

    const details = await Effect.runPromise(
      getUserDetailsUseCase({ userId: UserId(data.userId) }).pipe(
        withPostgres(AdminUserRepositoryLive, client),
        withTracing,
      ),
    )

    return toDto(details)
  })
