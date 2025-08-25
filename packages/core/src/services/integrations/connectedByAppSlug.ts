import type {
  PipedreamIntegration,
  PipedreamIntegrationWithAcountCount,
  Workspace,
} from '@latitude-data/core/browser'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { buildPipedreamClient } from './pipedream/apps'
import { fetchTriggerCounts } from './pipedream/fetchTriggerCounts'

function mergeConnectedAppsBySlug(
  connectedApps: PipedreamIntegration[],
): PipedreamIntegrationWithAcountCount[] {
  const appMap = new Map<string, { app: PipedreamIntegration; accountCount: number }>()

  for (const app of connectedApps) {
    const appName = app.configuration.appName
    const existing = appMap.get(appName)

    if (existing) {
      existing.accountCount += 1
    } else {
      appMap.set(appName, { app, accountCount: 1 })
    }
  }

  return Array.from(appMap.values()).map(({ app, accountCount }) => {
    return {
      ...app,
      accountCount,
    } satisfies PipedreamIntegrationWithAcountCount
  })
}

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
    await new IntegrationsRepository(workspace.id).getConnectedPipedreamApps({
      withTools,
      withTriggers,
    }),
  )
  const pipedreamResult = buildPipedreamClient()
  if (pipedreamResult.error) return pipedreamResult
  const pipedream = pipedreamResult.value

  return fetchTriggerCounts({
    type: 'connectedApps',
    apps: connectedPipedreamApps,
    pipedream,
  })
}
