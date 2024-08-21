import {
  apiKeys,
  database,
  factories,
  mergeCommit,
  Result,
} from '@latitude-data/core'
import {
  ChainEventTypes,
  Commit,
  DocumentVersion,
  Project,
  StreamEventTypes,
  Workspace,
} from '@latitude-data/core/browser'
import app from '$/index'
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

vi.mock('@latitude-data/core', async (importOriginal) => {
  const original = (await importOriginal()) as typeof importOriginal

  return {
    ...original,
    runDocumentAtCommit: mocks.runDocumentAtCommit,
  }
})

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
let documentVersion: DocumentVersion

describe('POST /run', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v1/projects/1/commits/asldkfjhsadl/documents/run',
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
      } = await factories.createProject()
      project = prj
      workspace = wsp
      const apikey = await database.query.apiKeys.findFirst({
        where: eq(apiKeys.workspaceId, workspace.id),
      })
      token = apikey?.token!
      const path = '/path/to/document'
      const { commit: cmt } = await factories.createDraft({
        project,
        user,
      })
      const document = await factories.createDocumentVersion({
        commit: cmt,
        path,
        content: `
          ---
            provider: openai
            model: gpt-4o
          ---

          Ignore all the rest and just return "Hello".
        `,
      })
      documentVersion = document.documentVersion

      commit = await mergeCommit(cmt).then((r) => r.unwrap())

      route = `/api/v1/projects/${project!.id}/commits/${commit!.uuid}/documents/run`
      body = JSON.stringify({
        documentPath: document.documentVersion.path,
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

    it('enqueue the document log', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      const response = new Promise((resolve) => {
        resolve({ text: 'Hello', usage: {} })
      })

      mocks.runDocumentAtCommit.mockClear()
      mocks.runDocumentAtCommit.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              response,
              documentLogUuid: 'fake-document-log-uuid',
              resolvedContent: 'resolved_content',
            }),
          )
        }),
      )

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
        mocks.queues.defaultQueue.jobs.enqueueCreateDocumentLogJob,
      ).toHaveBeenCalledWith({
        commit,
        data: {
          uuid: 'fake-document-log-uuid',
          documentUuid: documentVersion.documentUuid,
          resolvedContent: 'resolved_content',
          parameters: {},
          duration: expect.any(Number),
        },
      })
    })
  })
})
