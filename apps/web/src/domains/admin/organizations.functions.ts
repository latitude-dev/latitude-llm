import {
  type AdminOrganizationDetails,
  type AdminOrganizationUsageCursor,
  type AdminOrganizationUsageSummary,
  adminOrganizationUsageCursorSchema,
  getOrganizationDetailsUseCase,
  type ListOrganizationsByUsageOutput,
  listOrganizationsByUsageUseCase,
  ORGANIZATION_USAGE_MAX_LIMIT,
} from "@domain/admin"
import { OrganizationId } from "@domain/shared"
import { AdminOrganizationUsageRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { AdminOrganizationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getClickhouseClient } from "../../server/clients.ts"

export interface AdminOrganizationMemberDto {
  membershipId: string
  role: "owner" | "admin" | "member"
  user: {
    id: string
    email: string
    name: string | null
    image: string | null
    role: "user" | "admin"
  }
}

export interface AdminOrganizationProjectDto {
  id: string
  name: string
  slug: string
  createdAt: string
}

interface AdminOrganizationDetailsDto {
  id: string
  name: string
  slug: string
  stripeCustomerId: string | null
  members: AdminOrganizationMemberDto[]
  projects: AdminOrganizationProjectDto[]
  createdAt: string
  updatedAt: string
}

const toDto = (details: AdminOrganizationDetails): AdminOrganizationDetailsDto => ({
  id: details.id,
  name: details.name,
  slug: details.slug,
  stripeCustomerId: details.stripeCustomerId,
  members: details.members.map((m) => ({
    membershipId: m.membershipId,
    role: m.role,
    user: {
      id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      image: m.user.image,
      role: m.user.role,
    },
  })),
  projects: details.projects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    createdAt: p.createdAt.toISOString(),
  })),
  createdAt: details.createdAt.toISOString(),
  updatedAt: details.updatedAt.toISOString(),
})

/**
 * Exported for input-schema tests.
 */
export const adminGetOrganizationInputSchema = z.object({
  organizationId: z.string().min(1).max(256),
})

/**
 * Backoffice organisation-detail fetch.
 *
 * Guard: {@link adminMiddleware} — runs before validation, rejects
 * non-admins with `NotFoundError` (identical to hitting a non-existent
 * server function). Queries use {@link getAdminPostgresClient} +
 * `withPostgres` at the default `OrganizationId("system")` scope —
 * the only sanctioned RLS-bypass signal.
 */
export const adminGetOrganization = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminGetOrganizationInputSchema)
  .handler(async ({ data }): Promise<AdminOrganizationDetailsDto> => {
    const client = getAdminPostgresClient()

    const details = await Effect.runPromise(
      getOrganizationDetailsUseCase({ organizationId: OrganizationId(data.organizationId) }).pipe(
        withPostgres(AdminOrganizationRepositoryLive, client),
        withTracing,
      ),
    )

    return toDto(details)
  })

// ───────────────────────────────────────────────────────────────────
// Organisations by usage (backoffice listing)
// ───────────────────────────────────────────────────────────────────

export interface AdminOrganizationUsageItemDto {
  id: string
  name: string
  slug: string
  plan: string | null
  memberCount: number
  traceCount: number
  /** ISO-8601, or null when the org has no traces in the rolling window. */
  lastTraceAt: string | null
  createdAt: string
}

interface AdminOrganizationUsagePageDto {
  items: AdminOrganizationUsageItemDto[]
  /** Opaque, base64url-encoded next-page cursor; null when there's no more data. */
  nextCursor: string | null
}

const toUsageItemDto = (item: AdminOrganizationUsageSummary): AdminOrganizationUsageItemDto => ({
  id: item.id,
  name: item.name,
  slug: item.slug,
  plan: item.plan,
  memberCount: item.memberCount,
  traceCount: item.traceCount,
  lastTraceAt: item.lastTraceAt ? item.lastTraceAt.toISOString() : null,
  createdAt: item.createdAt.toISOString(),
})

const toUsagePageDto = (page: ListOrganizationsByUsageOutput): AdminOrganizationUsagePageDto => ({
  items: page.items.map(toUsageItemDto),
  nextCursor: page.nextCursor ? encodeUsageCursor(page.nextCursor) : null,
})

const encodeUsageCursor = (cursor: AdminOrganizationUsageCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")

const decodeUsageCursor = (encoded: string): AdminOrganizationUsageCursor => {
  // Throw a generic error on malformed input — the cursor is opaque to
  // the client, so a malformed string is a bug, not a user error.
  const decoded = Buffer.from(encoded, "base64url").toString("utf8")
  return adminOrganizationUsageCursorSchema.parse(JSON.parse(decoded))
}

export const adminListOrganizationsByUsageInputSchema = z.object({
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.number().int().positive().max(ORGANIZATION_USAGE_MAX_LIMIT).optional(),
})

/**
 * Backoffice "organisations by usage" listing. Sorted by trace count over
 * the rolling 30-day window (descending), with org id as the tiebreaker so
 * pagination is deterministic.
 *
 * Guard: {@link adminMiddleware}. Postgres queries run on the admin client
 * at the `"system"` org scope (RLS bypass); ClickHouse aggregates `traces`
 * cross-tenant via the dedicated admin port — see the security warnings on
 * `AdminOrganizationUsageRepositoryLive` and `AdminOrganizationRepositoryLive`.
 */
export const adminListOrganizationsByUsage = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminListOrganizationsByUsageInputSchema)
  .handler(async ({ data }): Promise<AdminOrganizationUsagePageDto> => {
    const cursor = data.cursor ? decodeUsageCursor(data.cursor) : undefined

    const page = await Effect.runPromise(
      listOrganizationsByUsageUseCase({
        ...(cursor ? { cursor } : {}),
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
      }).pipe(
        withPostgres(AdminOrganizationRepositoryLive, getAdminPostgresClient()),
        withClickHouse(AdminOrganizationUsageRepositoryLive, getClickhouseClient()),
        withTracing,
      ),
    )

    return toUsagePageDto(page)
  })
