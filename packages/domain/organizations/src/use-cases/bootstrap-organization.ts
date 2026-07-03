import { DEFAULT_API_KEY_NAME, type GenerateApiKeyError, generateApiKeyUseCase } from "@domain/api-keys"
import { OutboxEventWriter } from "@domain/events"
import { type CreateProjectError, createProjectUseCase } from "@domain/projects"
import {
  type ConcurrentSqlTransactionError,
  type OrganizationId,
  type RepositoryError,
  SqlClient,
  toRepositoryError,
} from "@domain/shared"
import type { CryptoError } from "@repo/utils"
import { Effect } from "effect"
import { createOrganization } from "../entities/organization.ts"
import type { SlugGenerationError } from "../errors.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import { generateOrganizationClaimUseCase } from "./generate-organization-claim.ts"
import { generateUniqueOrganizationSlugUseCase } from "./generate-unique-organization-slug.ts"

export const DEFAULT_TEMPORARY_ORGANIZATION_NAME = "My Organization"
export const DEFAULT_TEMPORARY_PROJECT_NAME = "My Project"

/** Unclaimed temporary accounts live for one week before cleanup (spec §7 decision 1). */
export const TEMPORARY_ACCOUNT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface BootstrapOrganizationInput {
  // Caller-generated so the admin `SqlClient` is scoped to it before this runs
  // (generateApiKeyUseCase / createProjectUseCase read the org id off the client).
  readonly organizationId: OrganizationId
  readonly organizationName?: string | undefined
  readonly projectName?: string | undefined
  readonly userEmail?: string | undefined
  readonly webUrl: string
}

export interface BootstrapOrganizationResult {
  readonly organization: { readonly id: string; readonly slug: string }
  readonly project: { readonly id: string; readonly slug: string }
  readonly apiKey: string
  readonly claimUrl: string
  readonly claimEmail: string | null
  readonly claimExpiresAt: Date
}

export type BootstrapOrganizationError =
  | RepositoryError
  | ConcurrentSqlTransactionError
  | GenerateApiKeyError
  | CreateProjectError
  | SlugGenerationError
  | CryptoError

// Provisions an owner-less temp org + one API key + one named project + a claim token.
// Bypasses better-auth (which always mints an owner) via the admin client, and emits no
// `OrganizationCreated` so temp orgs stay out of the normal automation stream until claimed.
export const bootstrapOrganizationUseCase = Effect.fn("organizations.bootstrapOrganization")(function* (
  input: BootstrapOrganizationInput,
) {
  const sqlClient = yield* SqlClient
  yield* Effect.annotateCurrentSpan("organization.id", input.organizationId)

  const organizationName = input.organizationName?.trim() || DEFAULT_TEMPORARY_ORGANIZATION_NAME
  const projectName = input.projectName?.trim() || DEFAULT_TEMPORARY_PROJECT_NAME
  const claimEmail = input.userEmail?.trim() || null
  // One deadline shared by the org `expires_at`, the claim row, and `claimExpiresAt`.
  const expiresAt = new Date(Date.now() + TEMPORARY_ACCOUNT_TTL_MS)

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const organizationRepo = yield* OrganizationRepository
      const outboxEventWriter = yield* OutboxEventWriter

      const slug = yield* generateUniqueOrganizationSlugUseCase({ name: organizationName })

      const organization = createOrganization({
        id: input.organizationId,
        name: organizationName,
        slug,
        expiresAt,
      })
      yield* organizationRepo.save(organization)

      const apiKey = yield* generateApiKeyUseCase({ name: DEFAULT_API_KEY_NAME, isSandbox: false })

      const project = yield* createProjectUseCase({ name: projectName })

      const { claimUrl } = yield* generateOrganizationClaimUseCase({
        organizationId: input.organizationId,
        email: claimEmail,
        expiresAt,
        webUrl: input.webUrl,
      })

      if (claimEmail) {
        yield* outboxEventWriter
          .write({
            eventName: "ClaimEmailRequested",
            aggregateType: "organization",
            aggregateId: input.organizationId,
            organizationId: "system",
            payload: { email: claimEmail, claimUrl, organizationName, expiresAt: expiresAt.toISOString() },
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))
      }

      return {
        organization: { id: organization.id as string, slug: organization.slug },
        project: { id: project.id as string, slug: project.slug },
        apiKey: apiKey.token,
        claimUrl,
        claimEmail,
        claimExpiresAt: expiresAt,
      } satisfies BootstrapOrganizationResult
    }),
  )
})
