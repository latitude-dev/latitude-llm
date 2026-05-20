import {
  generateUniqueOrganizationSlugUseCase,
  MembershipRepository,
  OrganizationRepository,
  provisionOrganizationWorkspaceUseCase,
  updateOrganizationUseCase,
} from "@domain/organizations"
import { purgeOrganizationProjectsUseCase } from "@domain/projects"
import { BadRequestError, ForbiddenError, OrganizationId, UserId } from "@domain/shared"
import {
  ApiKeyRepositoryLive,
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession, requireUserSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getBetterAuth, getPostgresClient } from "../../server/clients.ts"

export const listOrganizations = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireUserSession()
  const client = getAdminPostgresClient()
  const repoLayer = Layer.merge(OrganizationRepositoryLive, MembershipRepositoryLive)
  return await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* OrganizationRepository
      return yield* repo.listByUserId(UserId(userId))
    }).pipe(withPostgres(repoLayer, client), withTracing),
  )
})

export const createOrganization = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    const userId = await requireUserSession()
    const adminClient = getAdminPostgresClient()
    const slug = await Effect.runPromise(
      generateUniqueOrganizationSlugUseCase({ name: data.name }).pipe(
        withPostgres(OrganizationRepositoryLive, adminClient),
        withTracing,
      ),
    )

    const organization = await getBetterAuth().api.createOrganization({
      body: {
        name: data.name,
        slug,
        userId,
        keepCurrentActiveOrganization: false,
      },
      headers: await getRequestHeaders(),
    })

    const organizationId = OrganizationId(organization.id)
    const workspace = await Effect.runPromise(
      provisionOrganizationWorkspaceUseCase({
        organizationId,
        actorUserId: userId,
        name: data.name,
        slug,
        defaultProjectName: "My project",
      }).pipe(
        withPostgres(
          Layer.mergeAll(ApiKeyRepositoryLive, ProjectRepositoryLive, OutboxEventWriterLive),
          adminClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return { ...organization, ...workspace }
  })

const organizationSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(), // TODO: deprecated. Removed from frontend but maintained to keep cascaded settings scaffold
})

export const updateOrganization = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(256).optional(),
      settings: organizationSettingsSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    return await Effect.runPromise(
      updateOrganizationUseCase({ name: data.name, settings: data.settings }).pipe(
        withPostgres(OrganizationRepositoryLive, client, organizationId),
        withTracing,
      ),
    )
  })

/**
 * Permanently delete an organization. Guarded so the only org that can be
 * destroyed is the one you are currently in, you are its `owner`, and there
 * are no other members — i.e. an org only you can see.
 *
 * Deletion is irreversible: each project is soft-deleted and emits a
 * `ProjectDeleted` event (so the per-project cleanup cascade runs, matching a
 * manual project deletion), then the org row is removed — its FK cascade drops
 * memberships, invitations, and OAuth apps. The client then bounces to
 * `/welcome`, which re-resolves the user's remaining orgs.
 */
export const deleteOrganization = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { userId, organizationId } = await requireSession()

    // You may only delete the organization you are currently active in. This
    // keeps the RLS context (active org) aligned with the org being deleted.
    if (data.id !== organizationId) {
      throw new ForbiddenError({ message: "You can only delete the organization you are currently in." })
    }

    const targetId = OrganizationId(data.id)

    // Authorize against the full member list. Read with the admin client so the
    // count is never narrowed by RLS — an under-count would be a security hole.
    const adminClient = getAdminPostgresClient()
    const members = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* MembershipRepository
        return yield* repo.listByOrganizationId(targetId)
      }).pipe(withPostgres(MembershipRepositoryLive, adminClient), withTracing),
    )

    const caller = members.find((member) => member.userId === userId)
    if (!caller || caller.role !== "owner") {
      throw new ForbiddenError({ message: "Only the organization owner can delete it." })
    }
    if (members.length > 1) {
      throw new BadRequestError({
        message: "Remove all other members before deleting the organization.",
      })
    }

    const client = getPostgresClient()
    await Effect.runPromise(
      Effect.gen(function* () {
        // Tear down the org's projects (soft-delete + ProjectDeleted cascade)
        // before removing the org row. The org delete then cascades members,
        // invitations, and OAuth apps via FK.
        yield* purgeOrganizationProjectsUseCase({ actorUserId: userId })
        const orgRepo = yield* OrganizationRepository
        yield* orgRepo.delete(targetId)
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, OrganizationRepositoryLive, OutboxEventWriterLive),
          client,
          targetId,
        ),
        withTracing,
      ),
    )
  })
