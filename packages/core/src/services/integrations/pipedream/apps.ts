import { UnprocessableEntityError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { App, BackendClient, createBackendClient } from '@pipedream/sdk/server'
import {
  AppDto,
  PipedreamComponent,
  PipedreamComponentType,
} from '../../../constants'
import { Result, TypedResult } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { fetchTriggerCounts } from './fetchTriggerCounts'

const LIST_APPS_LIMIT = 64

export function getPipedreamEnvironment() {
  const {
    PIPEDREAM_ENVIRONMENT,
    PIPEDREAM_CLIENT_ID,
    PIPEDREAM_CLIENT_SECRET,
    PIPEDREAM_PROJECT_ID,
  } = env

  if (
    !PIPEDREAM_ENVIRONMENT ||
    !PIPEDREAM_CLIENT_ID ||
    !PIPEDREAM_CLIENT_SECRET ||
    !PIPEDREAM_PROJECT_ID
  ) {
    return Result.error(
      new UnprocessableEntityError(
        'Pipedream credentials are not set. Please set PIPEDREAM_ENVIRONMENT, PIPEDREAM_CLIENT_ID, PIPEDREAM_CLIENT_SECRET and PIPEDREAM_PROJECT_ID in your environment variables.',
      ),
    )
  }

  return Result.ok({
    environment: PIPEDREAM_ENVIRONMENT,
    credentials: {
      clientId: PIPEDREAM_CLIENT_ID,
      clientSecret: PIPEDREAM_CLIENT_SECRET,
    },
    projectId: PIPEDREAM_PROJECT_ID,
  })
}

export function buildPipedreamClient() {
  const pipedreamEnv = getPipedreamEnvironment()

  if (pipedreamEnv.error) return pipedreamEnv

  return Result.ok(createBackendClient(pipedreamEnv.value))
}

export async function listApps({
  query,
  cursor,
  withTriggers: hasTriggers, // Sources are triggers in Pipedream, however the API is called with hasTriggers
  withTools: hasActions, // Actions are tools in Pipedream
  pipedreamClientBuilder = buildPipedreamClient,
}: {
  query?: string
  cursor?: string
  withTriggers?: boolean
  withTools?: boolean
  pipedreamClientBuilder?: () => TypedResult<BackendClient, Error>
} = {}): PromisedResult<{
  apps: App[]
  totalCount: number
  cursor: string
}> {
  const pipedreamResult = pipedreamClientBuilder()

  if (pipedreamResult.error) {
    return Result.error(pipedreamResult.error)
  }

  const pipedream = pipedreamResult.value

  try {
    const appsParams: {
      q?: string
      limit: number
      after?: string
      hasActions?: boolean
      hasTriggers?: boolean
    } = {
      q: query,
      limit: LIST_APPS_LIMIT,
      after: cursor,
      hasTriggers,
      hasActions,
    }

    const apps = await pipedream.getApps(appsParams)
    let appsList: App[] = apps.data

    if (hasTriggers) {
      const appsListResult = await fetchTriggerCounts({
        type: 'pipedreamApps',
        apps: appsList,
        pipedream,
      })
      appsList = appsListResult.unwrap()
    }
    return Result.ok({
      apps: appsList,
      totalCount: apps.page_info.total_count,
      cursor: apps.page_info.end_cursor,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}

async function getAllAppComponents(
  pipedream: BackendClient,
  appName: string,
): Promise<{
  tools: PipedreamComponent<PipedreamComponentType.Tool>[]
  triggers: PipedreamComponent<PipedreamComponentType.Trigger>[]
}> {
  const tools: PipedreamComponent<PipedreamComponentType.Tool>[] = []
  const triggers: PipedreamComponent<PipedreamComponentType.Trigger>[] = []
  let cursor: string | undefined = undefined

  do {
    const response = await pipedream.getComponents({
      app: appName,
      limit: LIST_APPS_LIMIT,
      after: cursor,
    })

    tools.push(
      ...(response.data.filter(
        (component) => component.component_type === PipedreamComponentType.Tool,
      ) as PipedreamComponent<PipedreamComponentType.Tool>[]),
    )

    triggers.push(
      ...(response.data.filter(
        (component) =>
          component.component_type === PipedreamComponentType.Trigger,
      ) as PipedreamComponent<PipedreamComponentType.Trigger>[]),
    )

    cursor = response.page_info.end_cursor
  } while (cursor)

  return {
    tools,
    triggers,
  }
}

export async function getApp({
  name,
}: {
  name: string
}): PromisedResult<AppDto> {
  const pipedreamEnv = getPipedreamEnvironment()
  if (!pipedreamEnv.ok) {
    return Result.error(pipedreamEnv.error!)
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())

  try {
    const app = await pipedream.getApp(name)
    const components = await getAllAppComponents(pipedream, name)

    return Result.ok({
      ...app.data,
      ...components,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
