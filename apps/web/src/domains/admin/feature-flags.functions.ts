import {
  type AdminFeatureFlagSummary,
  type AdminOrganizationFeatureFlag,
  type AdminOrganizationFeatureFlags,
  archiveFeatureFlagUseCase,
  createFeatureFlagUseCase,
  disableFeatureFlagForOrganizationUseCase,
  enableFeatureFlagForOrganizationUseCase,
  listFeatureFlagsUseCase,
  listOrganizationFeatureFlagsUseCase,
} from "@domain/admin"
import { FEATURE_FLAG_IDENTIFIER_MAX_LENGTH, FEATURE_FLAG_NAME_MAX_LENGTH } from "@domain/feature-flags"
import { OrganizationId, UserId } from "@domain/shared"
import { AdminFeatureFlagRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"

export interface AdminFeatureFlagEnabledOrganizationDto {
  readonly id: string
  readonly name: string
  readonly slug: string
}

export interface AdminFeatureFlagDto {
  readonly id: string
  readonly identifier: string
  readonly name: string | null
  readonly description: string | null
  readonly enabledOrganizations: AdminFeatureFlagEnabledOrganizationDto[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AdminOrganizationFeatureFlagDto {
  readonly id: string
  readonly identifier: string
  readonly name: string | null
  readonly description: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AdminOrganizationFeatureFlagsDto {
  readonly enabled: AdminOrganizationFeatureFlagDto[]
  readonly available: AdminOrganizationFeatureFlagDto[]
}

export const adminCreateFeatureFlagInputSchema = z.object({
  identifier: z.string().min(1).max(FEATURE_FLAG_IDENTIFIER_MAX_LENGTH),
  name: z.string().max(FEATURE_FLAG_NAME_MAX_LENGTH).nullable().optional(),
  description: z.string().nullable().optional(),
})

export const adminFeatureFlagIdentifierInputSchema = z.object({
  identifier: z.string().min(1).max(FEATURE_FLAG_IDENTIFIER_MAX_LENGTH),
})

export const adminOrganizationFeatureFlagsInputSchema = z.object({
  organizationId: z.string().min(1).max(256),
})

export const adminOrganizationFeatureFlagMutationInputSchema = z.object({
  organizationId: z.string().min(1).max(256),
  identifier: z.string().min(1).max(FEATURE_FLAG_IDENTIFIER_MAX_LENGTH),
})

const toFeatureFlagDto = (featureFlag: AdminFeatureFlagSummary): AdminFeatureFlagDto => ({
  id: featureFlag.id,
  identifier: featureFlag.identifier,
  name: featureFlag.name,
  description: featureFlag.description,
  enabledOrganizations: featureFlag.enabledOrganizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  })),
  createdAt: featureFlag.createdAt.toISOString(),
  updatedAt: featureFlag.updatedAt.toISOString(),
})

const toOrganizationFeatureFlagDto = (featureFlag: AdminOrganizationFeatureFlag): AdminOrganizationFeatureFlagDto => ({
  id: featureFlag.id,
  identifier: featureFlag.identifier,
  name: featureFlag.name,
  description: featureFlag.description,
  createdAt: featureFlag.createdAt.toISOString(),
  updatedAt: featureFlag.updatedAt.toISOString(),
})

const toOrganizationFeatureFlagsDto = (
  featureFlags: AdminOrganizationFeatureFlags,
): AdminOrganizationFeatureFlagsDto => ({
  enabled: featureFlags.enabled.map(toOrganizationFeatureFlagDto),
  available: featureFlags.available.map(toOrganizationFeatureFlagDto),
})

export const adminListFeatureFlags = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async (): Promise<AdminFeatureFlagDto[]> => {
    const result = await Effect.runPromise(
      listFeatureFlagsUseCase().pipe(
        withPostgres(AdminFeatureFlagRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )

    return result.map(toFeatureFlagDto)
  })

export const adminCreateFeatureFlag = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminCreateFeatureFlagInputSchema)
  .handler(async ({ data }): Promise<AdminFeatureFlagDto> => {
    const result = await Effect.runPromise(
      createFeatureFlagUseCase({
        identifier: data.identifier,
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      }).pipe(withPostgres(AdminFeatureFlagRepositoryLive, getAdminPostgresClient()), withTracing),
    )

    return toFeatureFlagDto(result)
  })

export const adminArchiveFeatureFlag = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminFeatureFlagIdentifierInputSchema)
  .handler(async ({ data }): Promise<void> => {
    await Effect.runPromise(
      archiveFeatureFlagUseCase({ identifier: data.identifier }).pipe(
        withPostgres(AdminFeatureFlagRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )
  })

export const adminListOrganizationFeatureFlags = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminOrganizationFeatureFlagsInputSchema)
  .handler(async ({ data }): Promise<AdminOrganizationFeatureFlagsDto> => {
    const result = await Effect.runPromise(
      listOrganizationFeatureFlagsUseCase({ organizationId: OrganizationId(data.organizationId) }).pipe(
        withPostgres(AdminFeatureFlagRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )

    return toOrganizationFeatureFlagsDto(result)
  })

export const adminEnableFeatureFlagForOrganization = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminOrganizationFeatureFlagMutationInputSchema)
  .handler(async ({ data, context }): Promise<void> => {
    await Effect.runPromise(
      enableFeatureFlagForOrganizationUseCase({
        organizationId: OrganizationId(data.organizationId),
        identifier: data.identifier,
        enabledByAdminUserId: UserId(context.adminUserId),
      }).pipe(withPostgres(AdminFeatureFlagRepositoryLive, getAdminPostgresClient()), withTracing),
    )
  })

export const adminDisableFeatureFlagForOrganization = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminOrganizationFeatureFlagMutationInputSchema)
  .handler(async ({ data }): Promise<void> => {
    await Effect.runPromise(
      disableFeatureFlagForOrganizationUseCase({
        organizationId: OrganizationId(data.organizationId),
        identifier: data.identifier,
      }).pipe(withPostgres(AdminFeatureFlagRepositoryLive, getAdminPostgresClient()), withTracing),
    )
  })
