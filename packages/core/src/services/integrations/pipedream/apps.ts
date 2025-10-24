import {
  LatitudeErrorCodes,
  UnprocessableEntityError,
} from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { PipedreamClient } from '@pipedream/sdk/server'
import { App, ExtendedPipedreamApp } from '../../../constants'
import { Result, TypedResult } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { getPageInfo } from './helpers/page'
import { AppsListRequest } from '@pipedream/sdk'
import { AppsListRequestSortKey } from '@pipedream/sdk'
import { AppsListRequestSortDirection } from '@pipedream/sdk'
import { getComponentsForApp } from './components/getComponents'
import { getCachedApps, getCachedApp, CachedAppResponse } from './cache/apps'

/**
 * Custom error for when Pipedream credentials are not configured
 */
export class PipedreamNotConfiguredError extends UnprocessableEntityError {
  constructor() {
    super(
      'Pipedream credentials are not set. Please set PIPEDREAM_ENVIRONMENT, PIPEDREAM_CLIENT_ID, PIPEDREAM_CLIENT_SECRET and PIPEDREAM_PROJECT_ID in your environment variables.',
    )
    this.name = LatitudeErrorCodes.UnprocessableEntityError
  }
}

const LIST_APPS_LIMIT = 30
const DISALLOW_LIST = ['openai', 'anthropic']

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
    return Result.error(new PipedreamNotConfiguredError())
  }

  const client = new PipedreamClient({
    clientId: PIPEDREAM_CLIENT_ID,
    clientSecret: PIPEDREAM_CLIENT_SECRET,
    projectId: PIPEDREAM_PROJECT_ID,
    projectEnvironment: PIPEDREAM_ENVIRONMENT,
  })

  return Result.ok(client)
}

const fetchAppsBuilder =
  ({
    query,
    cursor,
    pipedreamClientBuilder,
  }: {
    query?: string
    cursor?: string
    pipedreamClientBuilder: () => TypedResult<PipedreamClient, Error>
  }) =>
    async () => {
      // Initialize the Pipedream client only on cache miss
      const pipedreamResult = pipedreamClientBuilder()
      if (!Result.isOk(pipedreamResult)) {
        throw pipedreamResult.error
      }
      const pipedream = pipedreamResult.unwrap()

      const appsParams: AppsListRequest = {
        q: query,
        limit: LIST_APPS_LIMIT,
        after: cursor,
        sortKey: AppsListRequestSortKey.FeaturedWeight,
        sortDirection: AppsListRequestSortDirection.Desc,
      }

      const page = await pipedream.apps.list(appsParams)
      const apps = page.data as ExtendedPipedreamApp[]
      const filteredApps = apps
        .filter((app) => {
          // Filter out apps that do not require authentication, as they are not supported yet
          if (app.authType === undefined) return false

          // Filter out disallowed apps
          if (DISALLOW_LIST.includes(app.nameSlug)) return false

          return true
        })
        .map((app) => {
          // Exclude customFieldsJson and connect from the response to reduce payload size
          // These fields exist at runtime but may not be in the SDK type definition
          const {
            customFieldsJson: _cf,
            connect: _cn,
            ...appWithoutCustomFields
          } = app as typeof app & { customFieldsJson?: string; connect?: unknown }
          return appWithoutCustomFields
        })

      const pageInfo = getPageInfo(page)

      return {
        apps: filteredApps,
        totalCount: pageInfo.totalCount ?? apps.length,
        cursor: pageInfo.endCursor ?? '',
      }
    }

export async function listApps({
  query,
  cursor,
  pipedreamClientBuilder = getPipedreamClient,
}: {
  query?: string
  cursor?: string
  pipedreamClientBuilder?: () => TypedResult<PipedreamClient, Error>
} = {}): PromisedResult<{
  apps: App[]
  totalCount: number
  cursor: string
}> {
  try {
    const result = await getCachedApps({
      query,
      cursor,
      fetchApps: fetchAppsBuilder({
        query,
        cursor,
        pipedreamClientBuilder,
      }),
    })

    return Result.ok(result)
  } catch (error) {
    // Check if the error is about missing Pipedream credentials
    if (error instanceof PipedreamNotConfiguredError) {
      // Return empty result instead of failing when Pipedream is not configured
      return Result.ok({
        apps: [],
        totalCount: 0,
        cursor: '',
      })
    }

    return Result.error(error as Error)
  }
}

export async function getApp<C extends boolean>({
  name,
  withConfig,
  pipedreamClientBuilder = getPipedreamClient,
}: {
  name: string
  withConfig: C
  pipedreamClientBuilder?: () => TypedResult<PipedreamClient, Error>
}): PromisedResult<CachedAppResponse<C>> {
  const pipedreamResult = pipedreamClientBuilder()
  if (!Result.isOk(pipedreamResult)) return pipedreamResult
  const pipedream = pipedreamResult.unwrap()

  const fetchApp = async (): Promise<CachedAppResponse<C>> => {
    const app = await pipedream.apps.retrieve(name)

    const componentsResult = await getComponentsForApp(name, pipedream)
    if (!Result.isOk(componentsResult)) {
      throw componentsResult.error
    }
    const components = componentsResult.unwrap()

    // Exclude customFieldsJson and connect from the response to reduce payload size
    // These fields exist at runtime but may not be in the SDK type definition
    const {
      customFieldsJson: _cf,
      connect: _cn,
      ...appWithoutCustomFields
    } = app.data as ExtendedPipedreamApp

    // Optionally exclude configurableProps from components when withConfig is false
    const processedComponents = withConfig
      ? components
      : ({
        tools: components.tools.map(
          ({ configurableProps: _, ...tool }) => tool,
        ),
        triggers: components.triggers.map(
          ({ configurableProps: _, ...trigger }) => trigger,
        ),
      } as typeof components)

    return {
      ...appWithoutCustomFields,
      ...processedComponents,
    } as CachedAppResponse<C>
  }

  try {
    const result = await getCachedApp({
      nameSlug: name,
      withConfig,
      fetchApp,
    })

    return Result.ok(result)
  } catch (error) {
    return Result.error(error as Error)
  }
}
