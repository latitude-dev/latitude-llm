import {
  ChainEventTypes,
  Commit,
  Project,
  StreamEventTypes,
  Workspace,
} from '@latitude-data/core/browser'
import { database } from '@latitude-data/core/client'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  helpers,
} from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { apiKeys } from '@latitude-data/core/schema'
import { mergeCommit } from '@latitude-data/core/services/commits/merge'
import { parseSSEvent } from '$/common/parseSSEEvent'
import app from '$/routes/app'
import { eq } from 'drizzle-orm'
import { testConsumeStream } from 'test/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
            documentPath: '/path/to/document',
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
      // TODO: move to core
      const apikey = await database.query.apiKeys.findFirst({
        where: eq(apiKeys.workspaceId, workspace.id),
      })
      token = apikey?.token!
      const path = '/path/to/document'
      const { commit: cmt } = await createDraft({
        project,
        user,
      })
      const document = await createDocumentVersion({
        commit: cmt,
        path,
        content: helpers.createPrompt({ provider: providers[0]! }),
      })

      commit = await mergeCommit(cmt).then((r) => r.unwrap())

      route = `/api/v1/projects/${project!.id}/versions/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        path: document.documentVersion.path,
        parameters: {},
      })
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    })

    it('stream succeeds', async () => {
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
          type: ChainEventTypes.Complete,
          response: {
            text: 'Hello',
            usage: {},
          },
        },
      })
    })
  })
})
