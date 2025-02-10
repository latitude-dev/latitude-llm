import {
  ApiKey,
  LegacyChainEventTypes,
  LogSources,
  StreamEventTypes,
  Workspace,
} from '@latitude-data/core/browser'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import { createProject } from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { parseSSEvent } from '$/common/parseSSEEvent'
import app from '$/routes/app'
import { testConsumeStream } from 'test/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChainEventTypes } from '@latitude-data/constants'

const mocks = vi.hoisted(() => ({
  addMessages: vi.fn(async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({
          event: StreamEventTypes.Latitude,
          data: {
            type: ChainEventTypes.ProviderCompleted,
            response: {
              text: 'Hello',
              usage: {},
            },
          },
        })
        controller.enqueue({
          event: StreamEventTypes.Latitude,
          data: {
            type: ChainEventTypes.ChainCompleted,
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
            path: 'path/to/document',
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
      const key = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
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
          type: LegacyChainEventTypes.Complete,
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

    it('uses source from __internal', async () => {
      await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          messages: [],
          __internal: { source: LogSources.Playground },
        }),
        headers,
      })

      expect(mocks.addMessages).toHaveBeenCalledWith({
        workspace,
        documentLogUuid: 'fake-document-log-uuid',
        messages: [],
        source: LogSources.Playground,
      })
    })
  })
})
