import { apiKeys, database, Result } from '@latitude-data/core'
import {
  ApiKey,
  ChainEventTypes,
  LogSources,
  StreamEventTypes,
  Workspace,
} from '@latitude-data/core/browser'
import { createProject } from '@latitude-data/core/factories'
import app from '$/routes/app'
import { eq } from 'drizzle-orm'
import { testConsumeStream } from 'test/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addMessages: vi.fn(async ({ providerLogHandler }) => {
    providerLogHandler({ uuid: 'fake-provider-log-uuid' })
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
      jobs: {
        enqueueCreateProviderLogJob: vi.fn(),
      },
    },
  },
}))

vi.mock('@latitude-data/core', async (importOriginal) => {
  const original = (await importOriginal()) as typeof importOriginal

  return {
    ...original,
    addMessages: mocks.addMessages,
  }
})

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
      const res = await app.request('/api/v1/chats/add-message', {
        method: 'POST',
        body: JSON.stringify({
          documentPath: '/path/to/document',
        }),
      })

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
        // @ts-ignore
        where: eq(apiKeys.workspaceId, workspace.id),
      })
      apiKey = key!
      token = apiKey.token

      route = '/api/v1/chats/add-message'
      body = JSON.stringify({
        messages: [],
        source: LogSources.Playground,
        documentLogUuid: 'fake-document-log-uuid',
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

      const { done, value } = await testConsumeStream(
        res.body as ReadableStream,
      )
      expect(mocks.queues)
      expect(res.status).toBe(200)
      expect(res.body).toBeInstanceOf(ReadableStream)
      expect(done).toBe(true)
      expect(JSON.parse(value!)).toEqual({
        event: StreamEventTypes.Latitude,
        data: {
          type: ChainEventTypes.Complete,
          response: {
            text: 'Hello',
            usage: {},
          },
        },
        id: '0',
      })
    })

    it('calls addMessages provider', async () => {
      await app.request(route, { method: 'POST', body, headers })

      expect(mocks.addMessages).toHaveBeenCalledWith({
        workspace,
        documentLogUuid: 'fake-document-log-uuid',
        messages: [],
        providerLogHandler: expect.any(Function),
      })
    })

    it('enqueue the provider log of the new message', async () => {
      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      expect(mocks.queues)
      expect(res.status).toBe(200)
      expect(res.body).toBeInstanceOf(ReadableStream)
      await testConsumeStream(res.body as ReadableStream)

      expect(
        mocks.queues.defaultQueue.jobs.enqueueCreateProviderLogJob,
      ).toHaveBeenCalledWith({
        uuid: 'fake-provider-log-uuid',
        source: LogSources.Playground,
        apiKeyId: apiKey.id,
      })
    })
  })
})
