import { type Message } from '@latitude-data/compiler'
import { setupServer } from 'msw/node'
import { parseSSE } from '$sdk/utils/parseSSE'
import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'
import { TOOL_EVENTS, TOOL_EVENTS_OBJECT, TOOLS_DOCUMENT_UUID } from './events'
import { ToolCallDetails, ToolCalledFn } from '$sdk/utils/types'
import {
  ChainEventDto,
  ChainEventDtoResponse,
  StreamEventTypes,
} from '@latitude-data/constants/ai'

const encoder = new TextEncoder()

async function parseBody(bodyStream: ReadableStream) {
  let body = {}
  const reader = bodyStream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunks = new TextDecoder('utf-8').decode(value).trim()
    body = JSON.parse(chunks)
  }
  return body
}

async function buildStream(events: string[]) {
  return new ReadableStream({
    start(controller) {
      events.forEach((chunk, index) => {
        const parsed = parseSSE(chunk)
        // @ts-expect-error
        const { event, data } = parsed
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
        if (index === events.length - 1) {
          controller.close()
        }
      })
    },
  })
}

type StreamEvent = { event: StreamEventTypes; data: ChainEventDto }
function findCompleteChainEvent(events: StreamEvent[]) {
  const completeEvent = events.find((event) => {
    const data = event.data
    return data.type === 'chain-complete'
  })!
  return {
    ...completeEvent,
    data: {
      uuid: TOOLS_DOCUMENT_UUID,
      response:
        'response' in completeEvent.data
          ? (completeEvent.data.response as ChainEventDtoResponse)
          : undefined,
      messages:
        'messages' in completeEvent.data ? completeEvent.data.messages : [],
    },
  }
}

type ExpectedBody = { messages: Message[] }
function getStep(body: ExpectedBody) {
  const firstStep = TOOL_EVENTS.chatEventsFirst
  const lastStep = TOOL_EVENTS.chatEventsLast

  const messages = body.messages
  const isFirstStep = !!messages.find((m) => {
    const content = m.content
    if (!Array.isArray(content)) return false

    return content.find((c) => c.toolName === 'get_coordinates')
  })

  return { isFirstStep, firstStep, lastStep }
}

export function mockToolsServers() {
  function setupStreamToolServer(server: ReturnType<typeof setupServer>) {
    let mockRunBody = vi.fn()
    let mockChatBody = vi.fn()
    server.use(
      http.post(
        'http://localhost:8787/api/v2/projects/123/versions/live/documents/run',
        async (info) => {
          const body = await parseBody(info.request.body!)
          mockRunBody({ body })
          const stream = await buildStream(TOOL_EVENTS.runEvents)
          return new HttpResponse(stream, {
            headers: {
              'Content-Type': 'text/plain',
            },
          })
        },
      ),
      http.post(
        `http://localhost:8787/api/v2/conversations/${TOOLS_DOCUMENT_UUID}/chat`,
        async (info) => {
          const body = await parseBody(info.request.body!)
          mockChatBody({ body })
          const { isFirstStep, firstStep, lastStep } = getStep(
            body as ExpectedBody,
          )

          const chunks = isFirstStep ? firstStep : lastStep
          const stream = await buildStream(chunks)
          return new HttpResponse(stream, {
            headers: {
              'Content-Type': 'text/plain',
            },
          })
        },
      ),
    )
    return { mockRunBody, mockChatBody }
  }

  function setupSyncToolsServer(server: ReturnType<typeof setupServer>) {
    let mockRunBody = vi.fn()
    let mockChatBody = vi.fn()
    server.use(
      http.post(
        'http://localhost:8787/api/v2/projects/123/versions/live/documents/run',
        async (info) => {
          const body = await parseBody(info.request.body!)
          mockRunBody({ body })
          const completeEvent = findCompleteChainEvent(
            TOOL_EVENTS_OBJECT.runEvents as StreamEvent[],
          )!

          return HttpResponse.json({
            uuid: TOOLS_DOCUMENT_UUID,
            conversation: completeEvent.data.messages!,
            response: completeEvent.data.response!,
          })
        },
      ),
      http.post(
        `http://localhost:8787/api/v2/conversations/${TOOLS_DOCUMENT_UUID}/chat`,
        async (info) => {
          const body = await parseBody(info.request.body!)
          mockChatBody({ body })
          const { isFirstStep } = getStep(body as ExpectedBody)
          const completeEvent = findCompleteChainEvent(
            isFirstStep
              ? (TOOL_EVENTS_OBJECT.chatEventsFirst as StreamEvent[])
              : (TOOL_EVENTS_OBJECT.chatEventsLast as StreamEvent[]),
          )!

          return HttpResponse.json({
            uuid: TOOLS_DOCUMENT_UUID,
            conversation: completeEvent.data.messages!,
            response: completeEvent.data.response!,
          })
        },
      ),
    )
    return { mockRunBody, mockChatBody }
  }

  return { setupStreamToolServer, setupSyncToolsServer }
}

export const LOCATIONS = [
  {
    name: 'Barcelona',
    latitude: '41.3851',
    longitude: '2.1734',
    temperature: 24,
  },
  {
    name: 'Miami',
    latitude: '25.7617',
    longitude: '-80.1918',
    temperature: 30,
  },
  {
    name: 'Boston',
    latitude: '42.3601',
    longitude: '-71.0589',
    temperature: 10,
  },
]
export const LOCATIONS_BY_LAT_LONG = {
  '41.3851:2.1734': 'Barcelona',
  '25.7617:-80.1918': 'Miami',
  '42.3601:-71.0589': 'Boston',
}

export type MockedTools = {
  tool_not_requested: {}
  get_weather: { latitude: number; longitude: number }
  get_coordinates: { location: string }
}

export function buildMockTools(
  {
    pauseExecution,
    onPausedExecutionCallback,
  }: {
    pauseExecution?: boolean
    onPausedExecutionCallback?: (toolCallDetails: ToolCallDetails) => void
  } = { pauseExecution: false },
): ToolCalledFn<MockedTools> {
  return {
    tool_not_requested: async ({ id }) => {
      // This is here only to prove that tools are filtered
      return { id, name: 'tool_not_requested', result: {} }
    },
    get_coordinates: async ({ id, arguments: { location } }, details) => {
      if (pauseExecution) {
        onPausedExecutionCallback?.(details)
        return details.pauseExecution()
      }
      const { latitude, longitude } = LOCATIONS.find(
        (loc) => loc.name === location,
      )!
      return {
        id,
        name: 'get_coordinates',
        result: { latitude, longitude },
      }
    },
    get_weather: async ({ id, arguments: { latitude, longitude } }) => {
      const latlong = `${latitude}:${longitude}`
      // @ts-expect-error - We know it's defined
      const name = LOCATIONS_BY_LAT_LONG[latlong]
      const { temperature } = LOCATIONS.find((loc) => loc.name === name)!
      return {
        id,
        name: 'get_the_weather',
        result: { temperature },
      }
    },
  }
}
