import {
  ApiKey,
  ChainEventTypes,
  LogSources,
  StreamEventTypes,
  Workspace,
} from '@latitude-data/core/browser'
import { database } from '@latitude-data/core/client'
import { createProject } from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { apiKeys } from '@latitude-data/core/schema'
import { parseSSEvent } from '$/common/parseSSEEvent'
import app from '$/routes/app'
import { eq } from 'drizzle-orm'
import { testConsumeStream } from 'test/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addMessages: vi.fn(async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({
          event: StreamEventTypes.Latitude,
          data: {
            type: ChainEventTypes.Complete,
            response: {
              text: 'Hello',
              usage: {},
            },
          },
        })

        controller.close()
      },
    })
    const response = new Promise((resolve) => {
      resolve({ text: 'Hello', usage: {} })
    })
    return Result.ok({
      stream,
      response,
    })
  }),
  queues: {
    defaultQueue: {
      jobs: {},
    },
  },
}))

vi.mock(
  '@latitude-data/core/services/documentLogs/index',
  async (importOriginal) => {
    const original = (await importOriginal()) as typeof importOriginal

    return {
      ...original,
      addMessages: mocks.addMessages,
    }
  },
)

vi.mock('$/jobs', () => ({
  queues: mocks.queues,
}))

let route: string
let body: string
let token: string
let headers: Record<string, string>
let workspace: Workspace
let apiKey: ApiKey

describe('POST /add-message', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v1/conversations/fake-document-log-uuid/chat',
        {
          method: 'POST',
          body: JSON.stringify({
            path: '/path/to/document',
          }),
        },
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.addMessages.mockClear()

      const { workspace: wsp } = await createProject()
      workspace = wsp
      // TODO: move to core
      const key = await database.query.apiKeys.findFirst({
        where: eq(apiKeys.workspaceId, workspace.id),
      })
      apiKey = key!
      token = apiKey.token

      route = '/api/v1/conversations/fake-document-log-uuid/chat'
      body = JSON.stringify({
        messages: [],
      })
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    })

    it('stream succeeds', async () => {
      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      let { done, value } = await testConsumeStream(res.body as ReadableStream)
      const event = parseSSEvent(value!)

      expect(mocks.queues)
      expect(res.status).toBe(200)
      expect(res.body).toBeInstanceOf(ReadableStream)
      expect(done).toBe(true)
      expect(event).toEqual({
        id: 0,
        event: StreamEventTypes.Latitude,
        data: {
          type: ChainEventTypes.Complete,
          response: {
            text: 'Hello',
            usage: {},
          },
        },
      })
    })

    it('calls chat provider', async () => {
      await app.request(route, { method: 'POST', body, headers })

      expect(mocks.addMessages).toHaveBeenCalledWith({
        workspace,
        documentLogUuid: 'fake-document-log-uuid',
        messages: [],
        source: LogSources.API,
      })
    })
  })
})
