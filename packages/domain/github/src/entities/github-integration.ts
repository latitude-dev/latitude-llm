import { cuidSchema, organizationIdSchema, userIdSchema } from "@domain/shared"
import { z } from "zod"
import { GITHUB_ACCOUNT_TYPES, GITHUB_REPOSITORY_SELECTIONS } from "../constants.ts"

export const githubAccountTypeSchema = z.enum(GITHUB_ACCOUNT_TYPES)
export type GithubAccountType = z.infer<typeof githubAccountTypeSchema>

export const githubRepositorySelectionSchema = z.enum(GITHUB_REPOSITORY_SELECTIONS)
export type GithubRepositorySelection = z.infer<typeof githubRepositorySelectionSchema>

/**
 * A GitHub App installation connected to a Latitude organization. Flat entity
 * mapped by the repository to the shared `integrations` parent (`kind`,
 * `vendor_account_id = String(installationId)`, lifecycle) plus the
 * `github_integration_details` child (installation state). No GitHub secrets
 * are stored — installation tokens live only in Redis (5.1/D6).
 *
 * `revokedAt = null` is the currently-live install; `suspendedAt` reflects
 * GitHub's suspend/unsuspend state and pauses processing without revoking.
 */
export const githubIntegrationSchema = z.object({
  id: cuidSchema,
  organizationId: organizationIdSchema,
  installationId: z.number().int().positive(),
  accountLogin: z.string().min(1),
  accountType: githubAccountTypeSchema,
  repositorySelection: githubRepositorySelectionSchema,
  suspendedAt: z.date().nullable(),
  installedByUserId: userIdSchema,
  installedAt: z.date(),
  revokedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type GithubIntegration = z.infer<typeof githubIntegrationSchema>

export const isGithubIntegrationActive = (integration: GithubIntegration): boolean =>
  integration.revokedAt === null && integration.suspendedAt === null
