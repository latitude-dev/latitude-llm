import env from '$sdk/env'
import { RouteResolver } from '$sdk/utils'
import {
  ChainEvent,
  ChainEventTypes,
  HandlerType,
  StreamEventTypes,
} from '$sdk/utils/types'

export class LatitudeSdk {
  private latitudeApiKey: string
  private routeResolver: RouteResolver
  private projectId: number

  constructor({
    latitudeApiKey,
    projectId,
    basePath = env.BASE_PATH,
    https = env.HTTPS,
  }: {
    latitudeApiKey: string
    projectId: number
    basePath?: string
    https?: boolean
  }) {
    this.routeResolver = new RouteResolver({
      basePath,
      https,
      apiVersion: 'v1',
    })
    this.latitudeApiKey = latitudeApiKey
    this.projectId = projectId
  }

  async runDocument({
    params: { documentPath, commitUuid, parameters },
    onMessage,
    onError,
  }: {
    params: {
      documentPath: string
      commitUuid?: string
      parameters?: Record<string, unknown>
    }
    onMessage: (message: ChainEvent) => void
    onError?: (error: Error) => void
  }) {
    const route = this.routeResolver.resolve({
      handler: HandlerType.RunDocument,
      params: {
        projectId: this.projectId,
        commitUuid,
      },
    })

    const response = await fetch(route, {
      method: 'POST',
      headers: this.authHeader,
      body: this.bodyToString({
        documentPath,
        parameters,
      }),
    })

    const body = response.body ?? new ReadableStream()
    const reader = body.getReader()

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      const data = this.decodeValue(value, onError)
      onMessage(data)
    }

    // TODO: type this response as the same the API returns
    return response
  }

  private decodeValue(
    value: Uint8Array | null,
    onError?: (error: Error) => void,
  ) {
    if (!value) return null

    let json = null
    try {
      json = new TextDecoder('utf-8').decode(value)
      return JSON.parse(json)
    } catch (e) {
      onError?.(e as Error)
    }

    return json
  }

  private get authHeader() {
    return {
      Authorization: `Bearer ${this.latitudeApiKey}`,
      'Content-Type': 'application/json',
    }
  }

  private bodyToString(body: object) {
    return JSON.stringify(body)
  }
}

export type { StreamEventTypes, ChainEventTypes }
