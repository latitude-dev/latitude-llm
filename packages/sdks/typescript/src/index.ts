import env from '$sdk/env'
import { RouteResolver } from '$sdk/utils'
import { ChainEvent, HandlerType } from '$sdk/utils/types'

type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}
type ChainCallResponse = {
  documentLogUuid: string
  text: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export type RunDocumentResponse = {
  conversation: Message[]
  response: ChainCallResponse
}

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
    onFinished,
    onError,
  }: {
    params: {
      documentPath: string
      commitUuid?: string
      parameters?: Record<string, unknown>
    }
    onMessage?: (message: ChainEvent) => void
    onFinished?: (data: RunDocumentResponse) => void
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

    const conversation: Message[] = []
    let chainResponse: ChainCallResponse | null = null
    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      const chunks = new TextDecoder('utf-8').decode(value).trim()

      chunks.split('\n').forEach((line) => {
        const chunk = this.decodeValue(line, onError)
        if (!chunk) return

        // FIXME: Magic variables. I think we need to share these constants (enums)
        // in a new package. Now they are in `core` but I don't want to depend on core
        // just for this. We need these enums in production not only as a dev dependency.
        if (chunk.event === 'latitude-event') {
          const messages = 'messages' in chunk.data ? chunk.data.messages : []
          if (messages.length > 0) {
            // At the moment all message.content should be a string
            // but in the future this could be an image or other type
            // @ts-ignore
            conversation.push(...messages)
          }

          if (chunk.data.type === 'chain-complete') {
            chainResponse = chunk.data.response
          }
        }

        onMessage?.(chunk)
      })
    }

    const runResponse = {
      conversation,
      response: chainResponse!,
    }
    onFinished?.(runResponse)

    return runResponse
  }

  private decodeValue(line: string, onError?: (error: Error) => void) {
    let json = null
    try {
      return JSON.parse(line) as ChainEvent
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

export type { ChainEvent, Message }
