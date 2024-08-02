import {
  apiKeys,
  database,
  factories,
  mergeCommit,
  Result,
} from '@latitude-data/core'
import { ChainEventTypes, LATITUDE_EVENT } from '@latitude-data/core/browser'
import app from '$/index'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runDocumentVersion: vi.fn(),
}))

vi.mock('@latitude-data/core', async (importOriginal) => {
  const original = (await importOriginal()) as typeof importOriginal

  return {
    ...original,
    runDocumentVersion: mocks.runDocumentVersion,
  }
})

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
    it('succeeds', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            event: LATITUDE_EVENT,
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

      mocks.runDocumentVersion.mockReturnValue(
        new Promise((resolve) => {
          resolve(
            Result.ok({
              stream,
              response,
            }),
          )
        }),
      )

      const { workspace, user, project } = await factories.createProject()
      const apikey = await database.query.apiKeys.findFirst({
        where: eq(apiKeys.workspaceId, workspace.id),
      })
      const path = '/path/to/document'
      const { commit } = await factories.createDraft({
        project,
        user,
      })
      const document = await factories.createDocumentVersion({
        commit,
        path,
        content: `
          ---
            provider: openai
            model: gpt-4o
          ---

          Ignore all the rest and just return "Hello".
        `,
      })

      await mergeCommit(commit).then((r) => r.unwrap())

      const route = `/api/v1/projects/${project!.id}/commits/${commit!.uuid}/documents/run`
      const body = JSON.stringify({
        documentPath: document.documentVersion.path,
        parameters: {},
      })
      const res = await app.request(route, {
        method: 'POST',
        body,
        headers: {
          Authorization: `Bearer ${apikey!.token}`,
          'Content-Type': 'application/json',
        },
      })

      expect(res.status).toBe(200)
      expect(res.body).toBeInstanceOf(ReadableStream)

      const responseStream = res.body as ReadableStream
      const reader = responseStream.getReader()

      let done = false
      let value
      while (!done) {
        const { done: _done, value: _value } = await reader.read()
        done = _done
        if (_value) value = new TextDecoder().decode(_value)
      }

      expect(done).toBe(true)
      expect(JSON.parse(value!)).toEqual({
        event: LATITUDE_EVENT,
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
  })
})
