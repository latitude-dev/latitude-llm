import { ProjectRepository } from "@domain/projects"
import {
  DEFAULT_SANDBOX_NAME,
  deleteSandboxUseCase,
  findOrCreateLinkedSandboxProjectUseCase,
  findOrCreateSandboxUseCase,
  reactivateSandboxUseCase,
} from "@domain/sandboxes"
import { OrganizationId, projectIdSchema } from "@domain/shared"
import {
  ApiKeyRepositoryLive,
  BillingOverrideRepositoryLive,
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  SandboxRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getPostgresClient } from "../../server/clients.ts"

const sandboxWriteLayers = Layer.mergeAll(SandboxRepositoryLive, OrganizationRepositoryLive, MembershipRepositoryLive)
// createSandbox seeds a default sandbox API key in the same use-case, so its
// layer carries the api-key repo + outbox writer alongside the cap-check deps.
const sandboxCapLayers = Layer.mergeAll(
  sandboxWriteLayers,
  BillingOverrideRepositoryLive,
  StripeSubscriptionLookupLive,
  SettingsReaderLive,
  ApiKeyRepositoryLive,
  OutboxEventWriterLive,
)
const sandboxDeleteLayers = Layer.mergeAll(sandboxWriteLayers, ProjectRepositoryLive, OutboxEventWriterLive)
const sandboxProjectWriteLayers = Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive)

export const reactivateSandbox = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sandboxOrganizationId: z.string() }))
  .handler(async ({ data }) => {
    const { userId, organizationId } = await requireSession()
    const client = getAdminPostgresClient()

    return await Effect.runPromise(
      reactivateSandboxUseCase({
        sandboxOrganizationId: OrganizationId(data.sandboxOrganizationId),
        actorUserId: userId,
      }).pipe(withPostgres(sandboxCapLayers, client, organizationId), withTracing),
    )
  })

/**
 * Everything the sidebar toggle needs to land inside the sandbox, in one call:
 * find-or-create the org's single sandbox, then find-or-create the sandbox
 * project mirroring the given live project. The flow spans two RLS scopes
 * (parent org, then sandbox org), so it composes one scoped use-case run each.
 */
export const enterSandboxProject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: projectIdSchema }))
  .handler(async ({ data }): Promise<{ sandboxOrgId: string; projectSlug: string }> => {
    const { userId, organizationId } = await requireSession()
    const adminClient = getAdminPostgresClient()
    const client = getPostgresClient()

    // Parent-scoped read: also proves the project belongs to the caller's org.
    const liveProject = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findById(data.projectId)
      }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId), withTracing),
    )

    const { sandboxOrganizationId, createdNow } = await Effect.runPromise(
      findOrCreateSandboxUseCase({
        parentOrganizationId: organizationId,
        actorUserId: userId,
        name: DEFAULT_SANDBOX_NAME,
      }).pipe(withPostgres(sandboxCapLayers, adminClient, organizationId), withTracing),
    )

    try {
      const project = await Effect.runPromise(
        findOrCreateLinkedSandboxProjectUseCase({
          sandboxOrganizationId,
          liveProjectId: liveProject.id,
          liveProjectName: liveProject.name,
          actorUserId: userId,
        }).pipe(withPostgres(sandboxProjectWriteLayers, client, sandboxOrganizationId), withTracing),
      )
      return { sandboxOrgId: String(sandboxOrganizationId), projectSlug: project.slug }
    } catch (error) {
      // If the project step fails right after a fresh sandbox create, roll the
      // sandbox back so it doesn't orphan (and wrongly hold the single active
      // slot). Best-effort; surface the original error.
      if (createdNow) {
        await Effect.runPromise(
          deleteSandboxUseCase({ sandboxOrganizationId, actorUserId: userId }).pipe(
            withPostgres(sandboxDeleteLayers, adminClient, sandboxOrganizationId),
            withTracing,
          ),
        ).catch(() => {})
      }
      throw error
    }
  })
