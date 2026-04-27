import { type AdminProjectDetails, getProjectDetailsUseCase } from "@domain/admin"
import { ProjectId } from "@domain/shared"
import { AdminProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"

export interface AdminProjectOrganizationDto {
  id: string
  name: string
  slug: string
}

export interface AdminProjectDetailsDto {
  id: string
  name: string
  slug: string
  organization: AdminProjectOrganizationDto
  settings: { keepMonitoring?: boolean | undefined } | null
  firstTraceAt: string | null
  lastEditedAt: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

const toDto = (details: AdminProjectDetails): AdminProjectDetailsDto => ({
  id: details.id,
  name: details.name,
  slug: details.slug,
  organization: details.organization,
  settings: details.settings,
  firstTraceAt: details.firstTraceAt ? details.firstTraceAt.toISOString() : null,
  lastEditedAt: details.lastEditedAt.toISOString(),
  deletedAt: details.deletedAt ? details.deletedAt.toISOString() : null,
  createdAt: details.createdAt.toISOString(),
  updatedAt: details.updatedAt.toISOString(),
})

/**
 * Exported for input-schema tests.
 */
export const adminGetProjectInputSchema = z.object({
  projectId: z.string().min(1).max(256),
})

/**
 * Backoffice project-detail fetch.
 *
 * Guard: {@link adminMiddleware} — runs before validation, rejects
 * non-admins with `NotFoundError` (identical to hitting a non-existent
 * server function). Queries use {@link getAdminPostgresClient} +
 * `withPostgres` at the default `OrganizationId("system")` scope —
 * the only sanctioned RLS-bypass signal.
 */
export const adminGetProject = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminGetProjectInputSchema)
  .handler(async ({ data }): Promise<AdminProjectDetailsDto> => {
    const client = getAdminPostgresClient()

    const details = await Effect.runPromise(
      getProjectDetailsUseCase({ projectId: ProjectId(data.projectId) }).pipe(
        withPostgres(AdminProjectRepositoryLive, client),
        withTracing,
      ),
    )

    return toDto(details)
  })
