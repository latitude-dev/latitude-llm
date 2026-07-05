import { generateId, type OrganizationId, organizationIdSchema } from "@domain/shared"
import { z } from "zod"

// Claim record for a temporary org. Only the SHA-256 `tokenHash` is persisted (raw token lives in the claim URL).
export const organizationClaimSchema = z.object({
  id: z.string(),
  organizationId: organizationIdSchema,
  tokenHash: z.string().min(1),
  email: z.string().nullable(),
  expiresAt: z.date(),
  claimedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type OrganizationClaim = z.infer<typeof organizationClaimSchema>

export const createOrganizationClaim = (params: {
  id?: string
  organizationId: OrganizationId
  tokenHash: string
  email?: string | null
  expiresAt: Date
  claimedAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}): OrganizationClaim => {
  const now = new Date()
  return organizationClaimSchema.parse({
    id: params.id ?? generateId(),
    organizationId: params.organizationId,
    tokenHash: params.tokenHash,
    email: params.email ?? null,
    expiresAt: params.expiresAt,
    claimedAt: params.claimedAt ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  })
}
