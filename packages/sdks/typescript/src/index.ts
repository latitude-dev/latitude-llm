import type { Message } from '@latitude-data/compiler'
import { type ChainEventDto } from '@latitude-data/core/browser'
import env from '$sdk/env'
import { GatewayApiConfig, RouteResolver } from '$sdk/utils'
import { LatitudeApiError, LatitudeWrongSdkVersion } from '$sdk/utils/errors'
import {
  LogSources,
  SdkApiVersion,
  StreamChainResponse,
} from '$sdk/utils/types'
import { LatitudeSdkV1 } from '$sdk/versions/LatitudeSdkV1'
import { LatitudeSdkV2 } from '$sdk/versions/LatitudeSdkV2'

const WAIT_IN_MS_BEFORE_RETRY = 1000

type Options = {
  versionUuid?: string
  projectId?: number
  gateway?: GatewayApiConfig
  __internal?: { source?: LogSources; retryMs?: number }
  apiVersion?: SdkApiVersion
}

const DEFAULT_GAWATE_WAY = {
  host: env.GATEWAY_HOSTNAME,
  port: env.GATEWAY_PORT,
  ssl: env.GATEWAY_SSL,
}
const DEFAULT_INTERNAL = {
  source: LogSources.API,
  retryMs: WAIT_IN_MS_BEFORE_RETRY,
}

function getKlass(apiVersion: SdkApiVersion) {
  if (apiVersion === 'v1') return LatitudeSdkV1
  if (apiVersion === 'v2') return LatitudeSdkV2

  throw new LatitudeWrongSdkVersion(apiVersion)
}

class Latitude<V extends SdkApiVersion = 'v1'> {
  run: V extends 'v1' ? LatitudeSdkV1['run'] : LatitudeSdkV2['run']
  get: V extends 'v1' ? LatitudeSdkV1['get'] : LatitudeSdkV2['get']
  chat: V extends 'v1' ? LatitudeSdkV1['chat'] : LatitudeSdkV2['chat']

  constructor(
    apiKey: string,
    {
      projectId,
      versionUuid,
      gateway = DEFAULT_GAWATE_WAY,
      __internal,
      apiVersion = 'v1',
    }: Options = {
      apiVersion: 'v1',
      gateway: DEFAULT_GAWATE_WAY,
    },
  ) {
    const SDKlass = getKlass(apiVersion)
    const { source, retryMs } = { ...DEFAULT_INTERNAL, ...__internal }
    const sdk = new SDKlass({
      apiKey,
      projectId,
      versionUuid,
      options: {
        source,
        retryMs,
        routeResolver: new RouteResolver({
          gateway,
          apiVersion,
        }),
      },
    })

    this.run = sdk.run.bind(sdk)
    this.get = sdk.get.bind(sdk)
    this.chat = sdk.chat.bind(sdk)
  }
}

export { Latitude, LatitudeApiError, LogSources }
export type { ChainEventDto, Message, StreamChainResponse }
