import {
  type AdminFeatureFlagSummary,
  type AdminOrganizationFeatureFlag,
  type AdminOrganizationFeatureFlags,
  disableFeatureFlagForAllUseCase,
  disableFeatureFlagForOrganizationUseCase,
  enableFeatureFlagForAllUseCase,
  enableFeatureFlagForOrganizationUseCase,
  listFeatureFlagsUseCase,
  listOrganizationFeatureFlagsUseCase,
} from "@domain/admin"
import { type FeatureFlagId, featureFlagIdentifierSchema } from "@domain/feature-flags"
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
  readonly identifier: FeatureFlagId
  readonly emoji: string
  readonly name: string
  readonly description: string
  readonly enabledForAll: boolean
  readonly enabledOrganizations: AdminFeatureFlagEnabledOrganizationDto[]
}

export interface AdminOrganizationFeatureFlagDto {
  readonly identifier: FeatureFlagId
  readonly emoji: string
  readonly name: string
  readonly description: string
  readonly enabledForAll: boolean
}

export interface AdminOrganizationFeatureFlagsDto {
  readonly enabled: AdminOrganizationFeatureFlagDto[]
  readonly available: AdminOrganizationFeatureFlagDto[]
}

export const adminFeatureFlagIdentifierInputSchema = z.object({
  identifier: featureFlagIdentifierSchema,
})

export const adminOrganizationFeatureFlagsInputSchema = z.object({
  organizationId: z.string().min(1).max(256),
})

export const adminOrganizationFeatureFlagMutationInputSchema = z.object({
  organizationId: z.string().min(1).max(256),
  identifier: featureFlagIdentifierSchema,
})

const toFeatureFlagDto = (featureFlag: AdminFeatureFlagSummary): AdminFeatureFlagDto => ({
  identifier: featureFlag.identifier,
  emoji: featureFlag.emoji,
  name: featureFlag.name,
  description: featureFlag.description,
  enabledForAll: featureFlag.enabledForAll,
  enabledOrganizations: featureFlag.enabledOrganizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  })),
})

const toOrganizationFeatureFlagDto = (featureFlag: AdminOrganizationFeatureFlag): AdminOrganizationFeatureFlagDto => ({
  identifier: featureFlag.identifier,
  emoji: featureFlag.emoji,
  name: featureFlag.name,
  description: featureFlag.description,
  enabledForAll: featureFlag.enabledForAll,
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

export const adminEnableFeatureFlagForAll = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminFeatureFlagIdentifierInputSchema)
  .handler(async ({ data }): Promise<void> => {
    await Effect.runPromise(
      enableFeatureFlagForAllUseCase({ identifier: data.identifier }).pipe(
        withPostgres(AdminFeatureFlagRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )
  })

export const adminDisableFeatureFlagForAll = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminFeatureFlagIdentifierInputSchema)
  .handler(async ({ data }): Promise<void> => {
    await Effect.runPromise(
      disableFeatureFlagForAllUseCase({ identifier: data.identifier }).pipe(
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
