import {
  createPartnerUseCase,
  listPartnersUseCase,
  PARTNER_NAME_MAX_LENGTH,
  type Partner,
  type PartnerScope,
  partnerAllowedIpSchema,
  partnerIconUrlSchema,
  partnerRedirectUrlSchema,
  partnerScopeSchema,
  rotatePartnerSecretUseCase,
  setPartnerEnabledUseCase,
  softDeletePartnerUseCase,
  updatePartnerUseCase,
} from "@domain/partners"
import { PartnerId } from "@domain/shared"
import { OutboxEventWriterLive, PartnerRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"

/** Never carries the HMAC secret in any form — encrypted or not. */
export interface AdminPartnerDto {
  readonly id: string
  readonly name: string
  readonly iconUrl: string | null
  readonly redirectUrls: string[]
  readonly scopes: PartnerScope[]
  readonly allowedIps: string[]
  readonly enabled: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

/** The raw secret is readable exactly once, right after it is minted. */
export interface AdminPartnerSecretDto {
  readonly partner: AdminPartnerDto
  readonly rawSecret: string
}

const partnerNameSchema = z.string().trim().min(1).max(PARTNER_NAME_MAX_LENGTH)
// An empty field means "no icon"; anything else must satisfy the same `^https?://` rule
// `oauth_applications.icon` enforces as a CHECK, because that is where it gets copied.
const partnerIconInputSchema = z.union([partnerIconUrlSchema, z.literal("")]).nullish()
const partnerRedirectUrlsSchema = z
  .array(z.string())
  .transform((entries) => entries.map((entry) => entry.trim()).filter((entry) => entry !== ""))
  .pipe(z.array(partnerRedirectUrlSchema).min(1, "At least one redirect URL is required"))
const partnerScopesSchema = z.array(partnerScopeSchema)
// The editor is a textarea, so blank lines are normal input rather than an error.
const partnerAllowedIpsSchema = z
  .array(z.string())
  .transform((entries) => entries.map((entry) => entry.trim()).filter((entry) => entry !== ""))
  .pipe(z.array(partnerAllowedIpSchema))
  .optional()
  .default([])
const partnerIdInputSchema = z.string().min(1).max(256)

export const adminCreatePartnerInputSchema = z.object({
  name: partnerNameSchema,
  iconUrl: partnerIconInputSchema,
  redirectUrls: partnerRedirectUrlsSchema,
  scopes: partnerScopesSchema,
  allowedIps: partnerAllowedIpsSchema,
})

export const adminUpdatePartnerInputSchema = z.object({
  partnerId: partnerIdInputSchema,
  name: partnerNameSchema,
  iconUrl: partnerIconInputSchema,
  redirectUrls: partnerRedirectUrlsSchema,
  scopes: partnerScopesSchema,
  allowedIps: partnerAllowedIpsSchema,
})

export const adminSetPartnerEnabledInputSchema = z.object({
  partnerId: partnerIdInputSchema,
  enabled: z.boolean(),
})

export const adminPartnerIdInputSchema = z.object({
  partnerId: partnerIdInputSchema,
})

const toPartnerDto = (partner: Partner): AdminPartnerDto => ({
  id: partner.id,
  name: partner.name,
  iconUrl: partner.iconUrl,
  redirectUrls: [...partner.redirectUrls],
  scopes: [...partner.scopes],
  allowedIps: [...partner.allowedIps],
  enabled: partner.enabled,
  createdAt: partner.createdAt.toISOString(),
  updatedAt: partner.updatedAt.toISOString(),
})

const normalizeIconUrl = (iconUrl: string | null | undefined): string | null => iconUrl?.trim() || null

/** Every mutation writes its audit event in the same transaction as the row, so both layers travel together. */
const mutationLayers = Layer.mergeAll(PartnerRepositoryLive, OutboxEventWriterLive)

export const adminListPartners = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async (): Promise<AdminPartnerDto[]> => {
    const partners = await Effect.runPromise(
      listPartnersUseCase().pipe(withPostgres(PartnerRepositoryLive, getAdminPostgresClient()), withTracing),
    )

    return partners.map(toPartnerDto)
  })

export const adminCreatePartner = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminCreatePartnerInputSchema)
  .handler(async ({ data, context }): Promise<AdminPartnerSecretDto> => {
    const result = await Effect.runPromise(
      createPartnerUseCase({
        adminUserId: context.adminUserId,
        name: data.name,
        iconUrl: normalizeIconUrl(data.iconUrl),
        redirectUrls: data.redirectUrls,
        scopes: data.scopes,
        allowedIps: data.allowedIps,
      }).pipe(withPostgres(mutationLayers, getAdminPostgresClient()), withTracing),
    )

    return { partner: toPartnerDto(result.partner), rawSecret: result.rawSecret }
  })

export const adminUpdatePartner = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminUpdatePartnerInputSchema)
  .handler(async ({ data, context }): Promise<AdminPartnerDto> => {
    const updated = await Effect.runPromise(
      updatePartnerUseCase({
        id: PartnerId(data.partnerId),
        adminUserId: context.adminUserId,
        name: data.name,
        iconUrl: normalizeIconUrl(data.iconUrl),
        redirectUrls: data.redirectUrls,
        scopes: data.scopes,
        allowedIps: data.allowedIps,
      }).pipe(withPostgres(mutationLayers, getAdminPostgresClient()), withTracing),
    )

    return toPartnerDto(updated)
  })

export const adminSetPartnerEnabled = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminSetPartnerEnabledInputSchema)
  .handler(async ({ data, context }): Promise<AdminPartnerDto> => {
    const updated = await Effect.runPromise(
      setPartnerEnabledUseCase({
        id: PartnerId(data.partnerId),
        adminUserId: context.adminUserId,
        enabled: data.enabled,
      }).pipe(withPostgres(mutationLayers, getAdminPostgresClient()), withTracing),
    )

    return toPartnerDto(updated)
  })

export const adminRotatePartnerSecret = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminPartnerIdInputSchema)
  .handler(async ({ data, context }): Promise<AdminPartnerSecretDto> => {
    const result = await Effect.runPromise(
      rotatePartnerSecretUseCase({ id: PartnerId(data.partnerId), adminUserId: context.adminUserId }).pipe(
        withPostgres(mutationLayers, getAdminPostgresClient()),
        withTracing,
      ),
    )

    return { partner: toPartnerDto(result.partner), rawSecret: result.rawSecret }
  })

export const adminDeletePartner = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminPartnerIdInputSchema)
  .handler(async ({ data, context }): Promise<void> => {
    await Effect.runPromise(
      softDeletePartnerUseCase({ id: PartnerId(data.partnerId), adminUserId: context.adminUserId }).pipe(
        withPostgres(mutationLayers, getAdminPostgresClient()),
        withTracing,
      ),
    )
  })
