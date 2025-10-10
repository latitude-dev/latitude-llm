import {
  PipedreamIntegrationWithCounts,
  Workspace,
  IntegrationDto,
} from '../../schema/types'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { getAllAppComponents, getPipedreamClient } from './pipedream/apps'
import { Result } from '../../lib/Result'
import { IntegrationType } from '@latitude-data/constants'
import { mergeConnectedAppsBySlug } from '../../lib/pipedream/mergeConnectedAppsBySlug'

export async function listConnectedIntegrationsByApp({
  workspace,
  withTools,
  withTriggers,
}: {
  workspace: Workspace
  withTools?: boolean
  withTriggers?: boolean
}) {
  const connectedPipedreamApps = mergeConnectedAppsBySlug(
    (await new IntegrationsRepository(workspace.id).getConnectedPipedreamApps({
      withTools,
      withTriggers,
    })) as Extract<IntegrationDto, { type: IntegrationType.Pipedream }>[],
  )
  const pipedreamResult = getPipedreamClient()
  if (!Result.isOk(pipedreamResult)) return pipedreamResult
  const pipedream = pipedreamResult.unwrap()

  const integrationsWithCounts: PipedreamIntegrationWithCounts[] =
    await Promise.all(
      connectedPipedreamApps.map(async (app) => {
        const components = await getAllAppComponents(
          app.configuration.appName,
          pipedream,
        )
        return {
          ...app,
          triggerCount: components.unwrap().triggers.length,
        }
      }),
    )

  return Result.ok(integrationsWithCounts)
}
