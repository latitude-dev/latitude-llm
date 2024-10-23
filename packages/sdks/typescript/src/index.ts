import type { Message } from '@latitude-data/compiler'
import { type ChainEventDto } from '@latitude-data/core/browser'
import env from '$sdk/env'
import { GatewayApiConfig, RouteResolver } from '$sdk/utils'
import { LatitudeApiError } from '$sdk/utils/errors'
import {
  LogSources,
  SdkApiVersion,
  StreamChainResponse,
} from '$sdk/utils/types'
import { LatitudeSdk } from '$sdk/versions/LatitudeSdk'
import { LatitudeSdkV1 } from '$sdk/versions/LatitudeSdkV1'

type Options = {
  versionUuid?: string
  projectId?: number
  gateway?: GatewayApiConfig
  __internal?: { source: LogSources }
  apiVersion?: SdkApiVersion
}

const DEFAULT_GAWATE_WAY = {
  host: env.GATEWAY_HOSTNAME,
  port: env.GATEWAY_PORT,
  ssl: env.GATEWAY_SSL,
}
const DEFAULT_INTERNAL = { source: LogSources.API }

class Latitude {
  sdk: LatitudeSdk

  constructor(
    apiKey: string,
    {
      projectId,
      versionUuid,
      gateway = DEFAULT_GAWATE_WAY,
      __internal = DEFAULT_INTERNAL,
      apiVersion = 'v1',
    }: Options = {
        apiVersion: 'v1',
        gateway: DEFAULT_GAWATE_WAY,
        __internal: DEFAULT_INTERNAL,
      },
  ) {
    const routeResolver = new RouteResolver({
      gateway,
      apiVersion,
    })
    switch (apiVersion) {
      case 'v2':
        this.sdk = new LatitudeSdkV1({
          apiKey,
          projectId,
          versionUuid,
          source: __internal.source,
          routeResolver,
        })
        break
      default:
        this.sdk = new LatitudeSdkV1({
          apiKey,
          projectId,
          versionUuid,
          source: __internal.source,
          routeResolver,
        })
    }
  }

  async get(...args: Parameters<LatitudeSdk['get']>) {
    return this.sdk.get(...args)
  }

  run = async (
    ...args: Parameters<LatitudeSdk['run']>
  ): ReturnType<LatitudeSdk['run']> => {
    return this.sdk.run(...args)
  }

  chat = async (
    ...args: Parameters<LatitudeSdk['chat']>
  ): ReturnType<LatitudeSdk['chat']> => {
    return this.sdk.chat(...args)
  }
}

export { Latitude, LatitudeApiError, LogSources }
export type { ChainEventDto, Message, StreamChainResponse }
