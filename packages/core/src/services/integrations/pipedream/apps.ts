import { UnprocessableEntityError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { PipedreamClient } from '@pipedream/sdk/server'
import {
  AppDto,
  PipedreamComponent,
  PipedreamComponentType,
} from '../../../constants'
import { Result, TypedResult } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { getPageInfo } from './helpers/page'
import { AppsListRequest } from '@pipedream/sdk'
import { AppsListRequestSortKey } from '@pipedream/sdk'
import { AppsListRequestSortDirection } from '@pipedream/sdk'

const LIST_APPS_LIMIT = 64

export function getPipedreamClient(): TypedResult<PipedreamClient> {
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

  const client = new PipedreamClient({
    clientId: PIPEDREAM_CLIENT_ID,
    clientSecret: PIPEDREAM_CLIENT_SECRET,
    projectId: PIPEDREAM_PROJECT_ID,
    projectEnvironment: PIPEDREAM_ENVIRONMENT,
  })

  return Result.ok(client)
}

export async function listApps({
  query,
  cursor,
  withTriggers, // Sources are triggers in Pipedream, however the API is called with hasTriggers
  withTools, // Actions are tools in Pipedream
  pipedreamClientBuilder = getPipedreamClient,
}: {
  query?: string
  cursor?: string
  withTriggers?: boolean
  withTools?: boolean
  pipedreamClientBuilder?: () => TypedResult<PipedreamClient, Error>
} = {}): PromisedResult<{
  apps: AppDto[]
  totalCount: number
  cursor: string
}> {
  const pipedreamResult = pipedreamClientBuilder()
  if (!Result.isOk(pipedreamResult)) return pipedreamResult
  const pipedream = pipedreamResult.unwrap()

  try {
    const appsParams: AppsListRequest = {
      q: query,
      limit: LIST_APPS_LIMIT,
      after: cursor,
      sortKey: AppsListRequestSortKey.FeaturedWeight,
      sortDirection: AppsListRequestSortDirection.Desc,
    }

    const page = await pipedream.apps.list(appsParams)

    const apps: AppDto[] = await Promise.all(
      page.data.map(async (app) => {
        const componentsResult = await getAllAppComponents(
          app.nameSlug,
          pipedream,
        )
        return {
          ...app,
          ...componentsResult.unwrap(),
        }
      }),
    )

    const filteredApps = apps.filter((app) => {
      if (withTriggers && app.triggers.length === 0) return false
      if (withTools && app.tools.length === 0) return false

      // We are filtering out apps that do not require authentication, as they are not supported yet
      return app.authType !== undefined
    })

    const pageInfo = getPageInfo(page)

    return Result.ok({
      apps: filteredApps,
      totalCount: pageInfo.totalCount ?? apps.length,
      cursor: pageInfo.endCursor ?? '',
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function getAllAppComponents(
  appName: string,
  pipedream?: PipedreamClient,
): PromisedResult<{
  tools: PipedreamComponent<PipedreamComponentType.Tool>[]
  triggers: PipedreamComponent<PipedreamComponentType.Trigger>[]
}> {
  if (!pipedream) {
    const pipedreamResult = getPipedreamClient()
    if (!Result.isOk(pipedreamResult)) return pipedreamResult
    pipedream = pipedreamResult.unwrap()
  }

  let list = await pipedream.components.list({
    app: appName,
    limit: LIST_APPS_LIMIT,
  })

  const tools: PipedreamComponent<PipedreamComponentType.Tool>[] = []
  const triggers: PipedreamComponent<PipedreamComponentType.Trigger>[] = []

  const processPage = (pageData: typeof list.data) => {
    tools.push(
      ...(pageData.filter(
        (component) => component.componentType === PipedreamComponentType.Tool,
      ) as PipedreamComponent<PipedreamComponentType.Tool>[]),
    )

    triggers.push(
      ...(pageData.filter(
        (component) =>
          component.componentType === PipedreamComponentType.Trigger,
      ) as PipedreamComponent<PipedreamComponentType.Trigger>[]),
    )
  }

  processPage(list.data)

  while (list.hasNextPage()) {
    list = await list.getNextPage()
    processPage(list.data)
  }

  return Result.ok({
    tools,
    triggers,
  })
}

export async function getApp({
  name,
}: {
  name: string
}): PromisedResult<AppDto> {
  const pipedreamResult = getPipedreamClient()
  if (!Result.isOk(pipedreamResult)) return pipedreamResult
  const pipedream = pipedreamResult.unwrap()

  try {
    const app = await pipedream.apps.retrieve(name)

    const componentsResult = await getAllAppComponents(name, pipedream)
    if (!Result.isOk(componentsResult)) return componentsResult
    const components = componentsResult.unwrap()

    return Result.ok({
      ...app.data,
      ...components,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
