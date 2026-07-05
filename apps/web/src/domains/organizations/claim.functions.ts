import { claimOrganizationUseCase, OrganizationClaimRepository, OrganizationRepository } from "@domain/organizations"
import { OrganizationId } from "@domain/shared"
import {
  MembershipRepositoryLive,
  OrganizationClaimRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { hash } from "@repo/utils"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireUserSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getBetterAuth } from "../../server/clients.ts"

interface ClaimPreview {
  readonly organizationName: string
  readonly expiresAt: string
}

// Validates a claim token without consuming it (admin client, cross-org lookup); `null` → the route bounces.
export const getClaimPreview = createServerFn({ method: "GET" })
  .inputValidator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<ClaimPreview | null> => {
    const adminClient = getAdminPostgresClient()
    return Effect.runPromise(
      Effect.gen(function* () {
        const tokenHash = yield* hash(data.token)
        const claimRepo = yield* OrganizationClaimRepository
        const claim = yield* claimRepo.findByTokenHash(tokenHash)
        if (!claim || claim.claimedAt !== null || claim.expiresAt.getTime() <= Date.now()) return null

        const orgRepo = yield* OrganizationRepository
        const org = yield* orgRepo.findById(OrganizationId(claim.organizationId))
        if (org.expiresAt === null || org.expiresAt.getTime() <= Date.now()) return null

        return { organizationName: org.name, expiresAt: org.expiresAt.toISOString() }
      }).pipe(
        withPostgres(Layer.mergeAll(OrganizationClaimRepositoryLive, OrganizationRepositoryLive), adminClient),
        Effect.catch(() => Effect.succeed(null)),
        withTracing,
      ),
    )
  })

// Redeems the token: the signed-in user becomes the temp org's owner, then it's set active.
export const claimOrganization = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<{ id: string; slug: string }> => {
    const userId = await requireUserSession()
    const adminClient = getAdminPostgresClient()

    const result = await Effect.runPromise(
      claimOrganizationUseCase({ token: data.token, userId }).pipe(
        withPostgres(
          Layer.mergeAll(
            OrganizationClaimRepositoryLive,
            OrganizationRepositoryLive,
            MembershipRepositoryLive,
            OutboxEventWriterLive,
          ),
          adminClient,
        ),
        withTracing,
      ),
    )

    await getBetterAuth().api.setActiveOrganization({
      body: { organizationId: result.organization.id, organizationSlug: result.organization.slug },
      headers: await getRequestHeaders(),
    })

    return result.organization
  })
