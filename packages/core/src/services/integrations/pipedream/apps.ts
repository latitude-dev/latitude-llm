import { App, BackendClient, createBackendClient } from '@pipedream/sdk/server'
import { PromisedResult } from '../../../lib/Transaction'
import { env } from '@latitude-data/env'
import { Result } from '../../../lib/Result'
import { UnauthorizedError } from '@latitude-data/constants/errors'
import { V1Component } from '@pipedream/sdk/browser'

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
      new UnauthorizedError(
        'Pipedream credentials are not set. Please set PIPEDREAM_CLIENT_ID, PIPEDREAM_CLIENT_SECRET and PIPEDREAM_PROJECT_ID in your environment variables.',
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

export async function listApps({
  query,
  cursor,
}: { query?: string; cursor?: string } = {}): PromisedResult<{
  apps: App[]
  totalCount: number
  cursor: string
}> {
  const pipedreamEnv = getPipedreamEnvironment()
  if (!pipedreamEnv.ok) {
    return Result.error(pipedreamEnv.error!)
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())

  try {
    const apps = await pipedream.getApps({
      q: query,
      limit: LIST_APPS_LIMIT,
      after: cursor,
    })
    return Result.ok({
      apps: apps.data,
      totalCount: apps.page_info.total_count,
      cursor: apps.page_info.end_cursor,
    })
  } catch (error) {
    console.error(error)
    return Result.error(error as Error)
  }
}

async function getAllAppComponents(
  pipedream: BackendClient,
  appName: string,
): Promise<V1Component[]> {
  const components: V1Component[] = []
  let cursor: string | undefined = undefined

  do {
    const response = await pipedream.getComponents({
      app: appName,
      limit: LIST_APPS_LIMIT,
      after: cursor,
    })

    components.push(...response.data)
    cursor = response.page_info.end_cursor
  } while (cursor)

  return components
}

export async function getApp({ name }: { name: string }): PromisedResult<App> {
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
      components,
    })
  } catch (error) {
    console.error(error)
    return Result.error(error as Error)
  }
}
