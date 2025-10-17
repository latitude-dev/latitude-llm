import { AppRouteHandler } from '$/openApi/types'
import {
  IntegrationLegacyWebhookRoute,
  IntegrationWebhookRoute,
} from './webhook.route'
import { registerDocumentTriggerEvent } from '@latitude-data/core/services/documentTriggers/triggerEvents/registerEvent'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { unsafelyFindDocumentTrigger } from '@latitude-data/core/data-access/documentTriggers'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { PromisedResult } from '@latitude-data/core/lib/Transaction'
import { NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '@latitude-data/core/lib/Result'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

async function resolveWorkspaceAndCommit(
  triggerUuid: string,
  commitUuid?: string,
): PromisedResult<{ workspace: Workspace; commit: Commit }> {
  const rawTrigger = await unsafelyFindDocumentTrigger(triggerUuid)
  if (!rawTrigger) {
    return Result.error(
      new NotFoundError(`Trigger not found with uuid '${triggerUuid}'`),
    )
  }
  const workspace = await unsafelyFindWorkspace(rawTrigger.workspaceId)
  if (!workspace) {
    return Result.error(
      new NotFoundError(
        `Workspace not found with id '${rawTrigger.workspaceId}'`,
      ),
    )
  }
  const commitsRepo = new CommitsRepository(workspace.id)

  if (commitUuid) {
    const commitResult = await commitsRepo.getCommitByUuid({
      uuid: commitUuid,
      projectId: rawTrigger.projectId,
    })
    if (!Result.isOk(commitResult)) return commitResult
    const commit = commitResult.unwrap()

    return Result.ok({ workspace, commit })
  }

  const commit = await commitsRepo.getHeadCommit(rawTrigger.projectId)
  if (!commit) {
    return Result.error(
      new NotFoundError(
        `Head commit not found for project '${rawTrigger.projectId}'`,
      ),
    )
  }

  return Result.ok({ workspace, commit })
}

// @ts-expect-error: streamSSE has type issues with zod-openapi
// https://github.com/honojs/middleware/issues/735
// https://github.com/orgs/honojs/discussions/1803
export const integrationLegacyWebhookHandler: AppRouteHandler<
  IntegrationLegacyWebhookRoute
> = async (c) => {
  const { triggerUuid } = c.req.valid('param')
  const eventPayload = (await c.req.json()) as Record<string, unknown>
  const ctxResult = await resolveWorkspaceAndCommit(triggerUuid)
  const { workspace, commit } = ctxResult.unwrap()

  await registerDocumentTriggerEvent({
    workspace,
    triggerUuid,
    commit,
    eventPayload,
  }).then((r) => r.unwrap())

  return c.json({ success: true }, 200)
}

// @ts-expect-error: streamSSE has type issues with zod-openapi
// https://github.com/honojs/middleware/issues/735
// https://github.com/orgs/honojs/discussions/1803
export const integrationWebhookHandler: AppRouteHandler<
  IntegrationWebhookRoute
> = async (c) => {
  const { triggerUuid, commitUuid } = c.req.valid('param')
  const eventPayload = (await c.req.json()) as Record<string, unknown>
  const ctxResult = await resolveWorkspaceAndCommit(triggerUuid, commitUuid)
  const { workspace, commit } = ctxResult.unwrap()

  await registerDocumentTriggerEvent({
    workspace,
    triggerUuid,
    commit,
    eventPayload,
  }).then((r) => r.unwrap())

  return c.json({ success: true }, 200)
}
