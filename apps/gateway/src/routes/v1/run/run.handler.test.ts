import {
  LegacyChainEventTypes,
  Commit,
  LogSources,
  Project,
  StreamEventTypes,
  Workspace,
} from '@latitude-data/core/browser'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  helpers,
} from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { mergeCommit } from '@latitude-data/core/services/commits/merge'
import { parseSSEvent } from '$/common/parseSSEEvent'
import app from '$/routes/app'
import { testConsumeStream } from 'test/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChainEventTypes } from '@latitude-data/core/lib/chainStreamManager/events'

const mocks = vi.hoisted(() => ({
  runDocumentAtCommit: vi.fn(),
  queues: {
    defaultQueue: {
      jobs: {
        enqueueCreateProviderLogJob: vi.fn(),
        enqueueCreateDocumentLogJob: vi.fn(),
      },
    },
  },
}))

vi.mock(
  '@latitude-data/core/services/commits/runDocumentAtCommit',
  async (importOriginal) => {
    const original = (await importOriginal()) as typeof importOriginal

    return {
      ...original,
      runDocumentAtCommit: mocks.runDocumentAtCommit,
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
let project: Project
let workspace: Workspace
let commit: Commit

describe('POST /run', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v1/projects/1/versions/asldkfjhsadl/documents/run',
        {
          method: 'POST',
          body: JSON.stringify({
            documentPath: 'path/to/document',
          }),
        },
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      const {
        workspace: wsp,
        user,
        project: prj,
        providers,
      } = await createProject()
      project = prj
      workspace = wsp
      const apikey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
      token = apikey?.token!
      const path = 'path/to/document'
      const { commit: cmt } = await createDraft({
        project,
        user,
      })
      const document = await createDocumentVersion({
        workspace,
        user,
        commit: cmt,
        path,
        content: helpers.createPrompt({ provider: providers[0]! }),
      })

      commit = await mergeCommit(cmt).then((r) => r.unwrap())

      route = `/api/v1/projects/${project!.id}/versions/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        path: document.documentVersion.path,
        parameters: {},
        customIdentifier: 'miau',
      })
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    })

    it('uses source from __internal', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ChainCompleted,
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

      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              response,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify({
          path: 'path/to/document',
          parameters: {},
          __internal: { source: LogSources.Playground },
        }),
        headers,
      })

      await testConsumeStream(res.body as ReadableStream)

      expect(mocks.runDocumentAtCommit).toHaveBeenCalledWith({
        workspace,
        document: expect.anything(),
        commit,
        parameters: {},
        source: LogSources.Playground,
      })
    })

    it('stream succeeds', async () => {
      const responseContent = { text: 'Hello', usage: {} }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ProviderCompleted,
              response: responseContent,
              providerLog: {
                response: responseContent,
              },
            },
          })
          controller.enqueue({
            event: StreamEventTypes.Latitude,
            data: {
              type: ChainEventTypes.ChainCompleted,
              documentLogUuid: 'log1',
            },
          })

          controller.close()
        },
      })

      const response = Promise.resolve(responseContent)
      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              lastResponse: response,
            }),
          )
        }),
      )

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      let { done, value } = await testConsumeStream(res.body as ReadableStream)
      const event = parseSSEvent(value)
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
  })
})
