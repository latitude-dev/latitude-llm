import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  helpers,
} from '@latitude-data/core/factories'
import { mergeCommit } from '@latitude-data/core/services/commits/merge'
import { SpansRepository } from '@latitude-data/core/repositories'
import {
  SpanType,
  SpanKind,
  SpanStatus,
  LogSources,
} from '@latitude-data/core/constants'
import { Result } from '@latitude-data/core/lib/Result'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  diskPut: vi.fn(),
  diskPutBuffer: vi.fn(),
  cacheDel: vi.fn(),
}))

vi.mock('@latitude-data/core/lib/disk', async (importOriginal) => {
  const original = (await importOriginal()) as typeof importOriginal
  return {
    ...original,
    diskFactory: () => ({
      put: mocks.diskPut,
      putBuffer: mocks.diskPutBuffer,
    }),
  }
})

vi.mock('@latitude-data/core/cache', async (importOriginal) => {
  const original = (await importOriginal()) as typeof importOriginal
  return {
    ...original,
    cache: async () => ({
      del: mocks.cacheDel,
      multi: () => ({
        del: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      }),
      // Add methods needed by rate-limiter-flexible
      rlflxIncr: vi.fn().mockResolvedValue(1),
      rlflxExpire: vi.fn().mockResolvedValue(1),
      rlflxGet: vi.fn().mockResolvedValue(null),
      rlflxSet: vi.fn().mockResolvedValue('OK'),
      rlflxDel: vi.fn().mockResolvedValue(1),
    }),
  }
})

// Mock rate-limiter-flexible to bypass rate limiting
vi.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: vi.fn().mockImplementation(() => ({
    consume: vi.fn().mockResolvedValue({
      remainingPoints: 100,
      msBeforeNext: 1000,
    }),
  })),
}))

describe('POST /projects/:projectId/versions/:versionUuid/documents/logs', () => {
  describe('when unauthorized', () => {
    it('fails', async () => {
      const response = await app.request(
        '/api/v3/projects/1/versions/test-uuid/documents/logs',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: 'test/path',
            messages: [],
          }),
        },
      )

      expect(response.status).toBe(401)
    })
  })

  describe('when authorized', () => {
    let headers: Record<string, string>
    let workspaceId: number
    let projectId: number
    let commitUuid: string
    let documentPath: string

    beforeEach(async () => {
      vi.clearAllMocks()

      // Mock disk operations to return success
      mocks.diskPut.mockResolvedValue(Result.nil())
      mocks.diskPutBuffer.mockResolvedValue(Result.nil())
      mocks.cacheDel.mockResolvedValue(undefined)

      const { workspace, user, project, providers } = await createProject({
        providers: [
          {
            name: 'openai',
            type: 'openai' as any,
          },
        ],
      })
      workspaceId = workspace.id
      projectId = project.id

      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      headers = {
        Authorization: `Bearer ${apiKey.token}`,
        'Content-Type': 'application/json',
      }

      // Create a draft and document
      const { commit: draft } = await createDraft({
        project,
        user,
      })

      documentPath = 'test/document'
      await createDocumentVersion({
        workspace,
        user,
        commit: draft,
        path: documentPath,
        content: helpers.createPrompt({
          provider: providers[0]!.name,
        }),
      })

      const commit = await mergeCommit(draft).then((r) => r.unwrap())
      commitUuid = commit.uuid
    })

    it('creates prompt and completion spans successfully', async () => {
      const messages = [
        {
          role: 'user' as const,
          content: 'Hello, world!',
        },
      ]
      const responseText = 'Hello! How can I help you?'

      const route = `/api/v3/projects/${projectId}/versions/${commitUuid}/documents/logs`
      const res = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path: documentPath,
          messages,
          response: responseText,
        }),
      })

      expect(res.status).toBe(200)

      const responseBody = await res.json()
      expect(responseBody).toMatchObject({
        uuid: expect.any(String),
        documentUuid: expect.any(String),
        promptSpan: {
          id: expect.any(String),
          traceId: expect.any(String),
        },
        completionSpan: {
          id: expect.any(String),
          traceId: expect.any(String),
        },
      })

      // Verify spans were created in the database
      const spansRepo = new SpansRepository(workspaceId)
      const promptSpanResult = await spansRepo.get({
        spanId: responseBody.promptSpan.id,
        traceId: responseBody.promptSpan.traceId,
      })
      const promptSpan = promptSpanResult.unwrap()
      expect(promptSpan).toBeDefined()
      expect(promptSpan!.type).toBe(SpanType.Prompt)
      expect(promptSpan!.kind).toBe(SpanKind.Client)
      expect(promptSpan!.status).toBe(SpanStatus.Ok)
      expect(promptSpan!.name).toBe('prompt')
      expect(promptSpan!.source).toBe(LogSources.API)
      expect(promptSpan!.documentUuid).toBe(responseBody.documentUuid)
      expect(promptSpan!.commitUuid).toBe(commitUuid)
      expect(promptSpan!.projectId).toBe(projectId)

      const completionSpanResult = await spansRepo.get({
        spanId: responseBody.completionSpan.id,
        traceId: responseBody.completionSpan.traceId,
      })
      const completionSpan = completionSpanResult.unwrap()
      expect(completionSpan).toBeDefined()
      expect(completionSpan!.type).toBe(SpanType.Completion)
      expect(completionSpan!.kind).toBe(SpanKind.Client)
      expect(completionSpan!.status).toBe(SpanStatus.Ok)
      expect(completionSpan!.name).toBe('completion')
      expect(completionSpan!.parentId).toBe(promptSpan!.id)
      expect(completionSpan!.documentUuid).toBe(responseBody.documentUuid)
      expect(completionSpan!.commitUuid).toBe(commitUuid)

      // Verify metadata was saved (mocked)
      expect(mocks.diskPutBuffer).toHaveBeenCalledTimes(2)
      expect(mocks.cacheDel).toHaveBeenCalledTimes(3)

      // Verify the metadata keys contain the correct span IDs
      const diskPutCalls = mocks.diskPutBuffer.mock.calls
      expect(
        diskPutCalls.some((call) => call[0].includes(promptSpan!.id)),
      ).toBe(true)
      expect(
        diskPutCalls.some((call) => call[0].includes(completionSpan!.id)),
      ).toBe(true)
    })

    it('creates spans with response from message content when response is not provided', async () => {
      const messages = [
        {
          role: 'user' as const,
          content: 'Hello, world!',
        },
        {
          role: 'assistant' as const,
          content: 'Hello! How can I help you?',
        },
      ]

      const route = `/api/v3/projects/${projectId}/versions/${commitUuid}/documents/logs`
      const res = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path: documentPath,
          messages,
        }),
      })

      expect(res.status).toBe(200)

      const responseBody = await res.json()
      expect(responseBody).toMatchObject({
        uuid: expect.any(String),
        documentUuid: expect.any(String),
        promptSpan: {
          id: expect.any(String),
          traceId: expect.any(String),
        },
        completionSpan: {
          id: expect.any(String),
          traceId: expect.any(String),
        },
      })

      // Verify spans were created
      const spansRepo = new SpansRepository(workspaceId)
      const promptSpanResult = await spansRepo.get({
        spanId: responseBody.promptSpan.id,
        traceId: responseBody.promptSpan.traceId,
      })
      const promptSpan = promptSpanResult.unwrap()
      expect(promptSpan).toBeDefined()
      expect(promptSpan!.type).toBe(SpanType.Prompt)

      const completionSpanResult = await spansRepo.get({
        spanId: responseBody.completionSpan.id,
        traceId: responseBody.completionSpan.traceId,
      })
      const completionSpan = completionSpanResult.unwrap()
      expect(completionSpan).toBeDefined()
      expect(completionSpan!.type).toBe(SpanType.Completion)
    })

    it('fails when path is missing', async () => {
      const route = `/api/v3/projects/${projectId}/versions/${commitUuid}/documents/logs`
      const res = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [],
        }),
      })

      expect(res.status).toBe(400)
    })

    it('fails when messages are missing', async () => {
      const route = `/api/v3/projects/${projectId}/versions/${commitUuid}/documents/logs`
      const res = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path: documentPath,
        }),
      })

      expect(res.status).toBe(400)
    })
  })
})
