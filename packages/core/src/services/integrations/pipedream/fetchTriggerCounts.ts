import type { App, BackendClient } from '@pipedream/sdk/server'
import { buildPipedreamClient } from './apps'
import { Result, type TypedResult } from '../../../lib/Result'
import type {
  PipedreamIntegrationWithAcountCount,
  PipedreamIntegrationWithCounts,
} from '../../../browser'

function getClient(pipedream: BackendClient | undefined) {
  if (pipedream) return Result.ok(pipedream)

  return buildPipedreamClient()
}

function getSlug(app: App | PipedreamIntegrationWithAcountCount) {
  if ('name_slug' in app) return app.name_slug
  if ('configuration' in app && 'appName' in app.configuration) {
    return app.configuration.appName
  }
}

async function getAvailableTriggersForPipedreamApp({
  app,
  pipedream,
}: {
  app: App | PipedreamIntegrationWithAcountCount
  pipedream: BackendClient
}) {
  const slug = getSlug(app)
  if (!slug) return 0

  try {
    const triggerComponents = await pipedream.getComponents({
      app: slug,
      componentType: 'trigger',
      limit: 0,
    })

    return triggerComponents.page_info?.total_count ?? 0
  } catch {
    return 0
  }
}

type AppWithTriggerCount = App & { triggerCount: number }
type EnrichedApp<T> = T extends 'pipedreamApps'
  ? AppWithTriggerCount
  : T extends 'connectedApps'
    ? PipedreamIntegrationWithCounts
    : never

type AppsCollectionType = 'pipedreamApps' | 'connectedApps'
export async function fetchTriggerCounts<T extends AppsCollectionType>({
  apps,
  pipedream: pipedreamClient,
}: {
  type: T
  apps: T extends 'pipedreamApps'
    ? App[]
    : T extends 'connectedApps'
      ? PipedreamIntegrationWithAcountCount[]
      : never
  pipedream?: BackendClient
}): Promise<TypedResult<EnrichedApp<T>[]>> {
  const clientResult = getClient(pipedreamClient)
  if (clientResult.error) return clientResult

  const pipedream = clientResult.value
  const list = await Promise.all(
    apps.map(async (app) => {
      return {
        ...app,
        triggerCount: await getAvailableTriggersForPipedreamApp({
          app,
          pipedream,
        }),
      }
    }),
  )

  return Result.ok(list as EnrichedApp<T>[])
}
