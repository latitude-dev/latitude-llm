import { parseSSE } from '$sdk/utils/parseSSE'
import { ToolCalledFn } from '$sdk/utils/types'
import {
  ChainEventDto,
  ChainEventTypes,
  LatitudeEventData,
  LatitudeProviderCompletedEventData,
  StreamEventTypes,
} from '@latitude-data/constants'
import { type Message } from '@latitude-data/constants/messages'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { vi } from 'vitest'
import { TOOL_EVENTS, TOOL_EVENTS_OBJECT, TOOLS_DOCUMENT_UUID } from './events'

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
        // @ts-expect-error - We know it's defined
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
  const reversedEvents = [...events].reverse()
  const lastResponse = (
    reversedEvents.find(
      (event) => event.data.type === ChainEventTypes.ProviderCompleted,
    )?.data as LatitudeProviderCompletedEventData | undefined
  )?.response

  const lastEvent = reversedEvents[0]!.data as LatitudeEventData

  return {
    uuid: TOOLS_DOCUMENT_UUID,
    conversation: lastEvent.messages,
    response: lastResponse,
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

    return content.find(
      (c) => 'toolName' in c && c.toolName === 'get_coordinates',
    )
  })

  return { isFirstStep, firstStep, lastStep }
}

export function mockToolsServers() {
  function setupStreamToolServer(server: ReturnType<typeof setupServer>) {
    const mockRunBody = vi.fn()
    const mockChatBody = vi.fn()
    server.use(
      http.post(
        'http://localhost:8787/api/v3/projects/123/versions/live/documents/run',
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
        `http://localhost:8787/api/v3/conversations/${TOOLS_DOCUMENT_UUID}/chat`,
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
    const mockRunBody = vi.fn()
    const mockChatBody = vi.fn()
    server.use(
      http.post(
        'http://localhost:8787/api/v3/projects/123/versions/live/documents/run',
        async (info) => {
          const body = await parseBody(info.request.body!)
          mockRunBody({ body })
          const result = findCompleteChainEvent(
            TOOL_EVENTS_OBJECT.runEvents as StreamEvent[],
          )!

          return HttpResponse.json(result)
        },
      ),
      http.post(
        `http://localhost:8787/api/v3/conversations/${TOOLS_DOCUMENT_UUID}/chat`,
        async (info) => {
          const body = await parseBody(info.request.body!)
          mockChatBody({ body })
          const { isFirstStep } = getStep(body as ExpectedBody)
          const result = findCompleteChainEvent(
            isFirstStep
              ? (TOOL_EVENTS_OBJECT.chatEventsFirst as StreamEvent[])
              : (TOOL_EVENTS_OBJECT.chatEventsLast as StreamEvent[]),
          )!

          return HttpResponse.json(result)
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

export function buildMockTools(): ToolCalledFn<MockedTools> {
  return {
    tool_not_requested: async () => {
      // This is here only to prove that tools are filtered
      return 'do-nothing'
    },
    get_coordinates: async ({ location }) => {
      const { latitude, longitude } = LOCATIONS.find(
        (loc) => loc.name === location,
      )!
      return { latitude, longitude }
    },
    get_weather: async ({ latitude, longitude }) => {
      const latlong = `${latitude}:${longitude}`
      // @ts-expect-error - We know it's defined
      const name = LOCATIONS_BY_LAT_LONG[latlong]
      const { temperature } = LOCATIONS.find((loc) => loc.name === name)!
      return { temperature }
    },
  }
}
