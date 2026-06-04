import {
  archiveSandboxUseCase,
  createSandboxUseCase,
  deleteSandboxUseCase,
  reactivateSandboxUseCase,
} from "@domain/sandboxes"
import { OrganizationId } from "@domain/shared"
import {
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
import { getAdminPostgresClient } from "../../server/clients.ts"

const sandboxWriteLayers = Layer.mergeAll(SandboxRepositoryLive, OrganizationRepositoryLive, MembershipRepositoryLive)
const sandboxCapLayers = Layer.mergeAll(
  sandboxWriteLayers,
  BillingOverrideRepositoryLive,
  StripeSubscriptionLookupLive,
  SettingsReaderLive,
)
const sandboxDeleteLayers = Layer.mergeAll(sandboxWriteLayers, ProjectRepositoryLive, OutboxEventWriterLive)

const sandboxIdInput = z.object({ sandboxOrganizationId: z.string() })

export const createSandbox = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    const { userId, organizationId } = await requireSession()
    const client = getAdminPostgresClient()

    return await Effect.runPromise(
      createSandboxUseCase({
        parentOrganizationId: organizationId,
        actorUserId: userId,
        name: data.name,
      }).pipe(withPostgres(sandboxCapLayers, client, organizationId), withTracing),
    )
  })

export const archiveSandbox = createServerFn({ method: "POST" })
  .inputValidator(sandboxIdInput)
  .handler(async ({ data }) => {
    const { userId, organizationId } = await requireSession()
    const client = getAdminPostgresClient()

    return await Effect.runPromise(
      archiveSandboxUseCase({
        sandboxOrganizationId: OrganizationId(data.sandboxOrganizationId),
        actorUserId: userId,
      }).pipe(withPostgres(sandboxWriteLayers, client, organizationId), withTracing),
    )
  })

export const reactivateSandbox = createServerFn({ method: "POST" })
  .inputValidator(sandboxIdInput)
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

export const deleteSandbox = createServerFn({ method: "POST" })
  .inputValidator(sandboxIdInput)
  .handler(async ({ data }): Promise<void> => {
    const { userId } = await requireSession()
    const client = getAdminPostgresClient()
    const sandboxOrganizationId = OrganizationId(data.sandboxOrganizationId)

    await Effect.runPromise(
      deleteSandboxUseCase({ sandboxOrganizationId, actorUserId: userId }).pipe(
        withPostgres(sandboxDeleteLayers, client, sandboxOrganizationId),
        withTracing,
      ),
    )
  })
