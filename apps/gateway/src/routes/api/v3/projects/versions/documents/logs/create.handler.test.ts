import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
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
  SPAN_METADATA_STORAGE_KEY,
} from '@latitude-data/core/constants'
import { Result } from '@latitude-data/core/lib/Result'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  diskPut: vi.fn(),
  diskPutBuffer: vi.fn(),
  cacheDel: vi.fn(),
  publishSpanCreated: vi.fn(),
  bulkCreateClickHouseSpans: vi.fn(),
  isFeatureEnabledByName: vi.fn(),
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
      rlflxIncr: vi.fn().mockResolvedValue(1),
      rlflxExpire: vi.fn().mockResolvedValue(1),
      rlflxGet: vi.fn().mockResolvedValue(null),
      rlflxSet: vi.fn().mockResolvedValue('OK'),
      rlflxDel: vi.fn().mockResolvedValue(1),
    }),
  }
})

vi.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: vi.fn().mockImplementation(() => ({
    consume: vi.fn().mockResolvedValue({
      remainingPoints: 100,
      msBeforeNext: 1000,
    }),
  })),
}))

vi.mock(
  '@latitude-data/core/services/tracing/publishSpanCreated',
  async (importOriginal) => {
    const original = (await importOriginal()) as typeof importOriginal
    return {
      ...original,
      publishSpanCreated: mocks.publishSpanCreated,
    }
  },
)

vi.mock(
  '@latitude-data/core/services/tracing/spans/clickhouse/bulkCreate',
  async (importOriginal) => {
    const original = (await importOriginal()) as typeof importOriginal
    return {
      ...original,
      bulkCreate: mocks.bulkCreateClickHouseSpans,
    }
  },
)

vi.mock(
  '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName',
  async (importOriginal) => {
    const original = (await importOriginal()) as typeof importOriginal
    return {
      ...original,
      isFeatureEnabledByName: mocks.isFeatureEnabledByName,
    }
  },
)

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
    let documentContent: string

    beforeEach(async () => {
      vi.clearAllMocks()

      mocks.diskPut.mockResolvedValue(Result.nil())
      mocks.diskPutBuffer.mockResolvedValue(Result.nil())
      mocks.cacheDel.mockResolvedValue(undefined)
      mocks.publishSpanCreated.mockResolvedValue(undefined)
      mocks.isFeatureEnabledByName.mockResolvedValue(Result.ok(false))
      mocks.bulkCreateClickHouseSpans.mockResolvedValue(Result.nil())

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
      })

      headers = {
        Authorization: `Bearer ${apiKey.token}`,
        'Content-Type': 'application/json',
      }

      const { commit: draft } = await createDraft({
        project,
        user,
      })

      documentPath = 'test/document'
      documentContent = helpers.createPrompt({
        provider: providers[0]!.name,
      })
      await createDocumentVersion({
        workspace,
        user,
        commit: draft,
        path: documentPath,
        content: documentContent,
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
      expect(promptSpan!.name).toBe('document')
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

      expect(mocks.diskPutBuffer).toHaveBeenCalledTimes(2)
      expect(mocks.cacheDel).toHaveBeenCalledTimes(3)

      const diskPutCalls = mocks.diskPutBuffer.mock.calls
      expect(
        diskPutCalls.some((call: unknown[]) =>
          (call[0] as string).includes(promptSpan!.id),
        ),
      ).toBe(true)
      expect(
        diskPutCalls.some((call: unknown[]) =>
          (call[0] as string).includes(completionSpan!.id),
        ),
      ).toBe(true)
    })

    it('creates spans without response when response is not provided', async () => {
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

    it('derives prompt span name from document path', async () => {
      const route = `/api/v3/projects/${projectId}/versions/${commitUuid}/documents/logs`
      const res = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path: documentPath,
          messages: [{ role: 'user', content: 'test' }],
        }),
      })

      expect(res.status).toBe(200)

      const responseBody = await res.json()
      const spansRepo = new SpansRepository(workspaceId)
      const promptSpanResult = await spansRepo.get({
        spanId: responseBody.promptSpan.id,
        traceId: responseBody.promptSpan.traceId,
      })
      const promptSpan = promptSpanResult.unwrap()
      expect(promptSpan!.name).toBe('document')
    })

    it('publishes spanCreated event with correct arguments', async () => {
      const route = `/api/v3/projects/${projectId}/versions/${commitUuid}/documents/logs`
      const res = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path: documentPath,
          messages: [{ role: 'user', content: 'test' }],
        }),
      })

      expect(res.status).toBe(200)
      const responseBody = await res.json()

      expect(mocks.publishSpanCreated).toHaveBeenCalledTimes(1)
      expect(mocks.publishSpanCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          spanId: responseBody.promptSpan.id,
          traceId: responseBody.promptSpan.traceId,
          workspaceId,
          documentUuid: responseBody.documentUuid,
          spanType: SpanType.Prompt,
          parentId: null,
          projectId,
          commitUuid,
        }),
      )
    })

    it('saves metadata to disk for both prompt and completion spans', async () => {
      const route = `/api/v3/projects/${projectId}/versions/${commitUuid}/documents/logs`
      const res = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path: documentPath,
          messages: [{ role: 'user', content: 'test' }],
          response: 'test response',
        }),
      })

      expect(res.status).toBe(200)
      const responseBody = await res.json()

      expect(mocks.diskPutBuffer).toHaveBeenCalledTimes(2)

      const promptMetadataKey = SPAN_METADATA_STORAGE_KEY(
        workspaceId,
        responseBody.promptSpan.traceId,
        responseBody.promptSpan.id,
      )
      const completionMetadataKey = SPAN_METADATA_STORAGE_KEY(
        workspaceId,
        responseBody.completionSpan.traceId,
        responseBody.completionSpan.id,
      )

      const diskKeys = mocks.diskPutBuffer.mock.calls.map(
        (call: unknown[]) => call[0],
      )
      expect(diskKeys).toContain(promptMetadataKey)
      expect(diskKeys).toContain(completionMetadataKey)

      expect(mocks.cacheDel).toHaveBeenCalledWith(promptMetadataKey)
      expect(mocks.cacheDel).toHaveBeenCalledWith(completionMetadataKey)
    })

    it('shares the same traceId and documentLogUuid across both spans', async () => {
      const route = `/api/v3/projects/${projectId}/versions/${commitUuid}/documents/logs`
      const res = await app.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path: documentPath,
          messages: [{ role: 'user', content: 'test' }],
        }),
      })

      expect(res.status).toBe(200)
      const responseBody = await res.json()

      expect(responseBody.promptSpan.traceId).toBe(
        responseBody.completionSpan.traceId,
      )

      const spansRepo = new SpansRepository(workspaceId)

      const promptSpan = (
        await spansRepo.get({
          spanId: responseBody.promptSpan.id,
          traceId: responseBody.promptSpan.traceId,
        })
      ).unwrap()

      const completionSpan = (
        await spansRepo.get({
          spanId: responseBody.completionSpan.id,
          traceId: responseBody.completionSpan.traceId,
        })
      ).unwrap()

      expect(promptSpan!.documentLogUuid!.replace(/-/g, '')).toBe(
        responseBody.uuid,
      )
      expect(completionSpan!.documentLogUuid!.replace(/-/g, '')).toBe(
        responseBody.uuid,
      )
      expect(promptSpan!.documentLogUuid).toBe(completionSpan!.documentLogUuid)
      expect(promptSpan!.traceId).toBe(completionSpan!.traceId)
    })

    describe('when ClickHouse feature is enabled', () => {
      beforeEach(() => {
        mocks.isFeatureEnabledByName.mockResolvedValue(Result.ok(true))
        mocks.bulkCreateClickHouseSpans.mockResolvedValue(Result.nil())
      })

      it('writes spans to ClickHouse', async () => {
        const route = `/api/v3/projects/${projectId}/versions/${commitUuid}/documents/logs`
        const res = await app.request(route, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            path: documentPath,
            messages: [{ role: 'user', content: 'Hello' }],
            response: 'Hi there!',
          }),
        })

        expect(res.status).toBe(200)
        const responseBody = await res.json()

        expect(mocks.bulkCreateClickHouseSpans).toHaveBeenCalledTimes(1)
        const chSpans = mocks.bulkCreateClickHouseSpans.mock.calls[0]![0]
        expect(chSpans).toHaveLength(2)

        const chPromptSpan = chSpans.find(
          (s: Record<string, unknown>) => s.type === SpanType.Prompt,
        )
        const chCompletionSpan = chSpans.find(
          (s: Record<string, unknown>) => s.type === SpanType.Completion,
        )

        expect(chPromptSpan).toMatchObject({
          id: responseBody.promptSpan.id,
          traceId: responseBody.promptSpan.traceId,
          workspaceId,
          type: SpanType.Prompt,
          kind: SpanKind.Client,
          status: SpanStatus.Ok,
          name: 'document',
        })

        expect(chCompletionSpan).toMatchObject({
          id: responseBody.completionSpan.id,
          traceId: responseBody.completionSpan.traceId,
          parentId: responseBody.promptSpan.id,
          workspaceId,
          type: SpanType.Completion,
          kind: SpanKind.Client,
          status: SpanStatus.Ok,
          name: 'completion',
        })

        expect(chPromptSpan.retentionExpiresAt).toBeInstanceOf(Date)
        expect(chCompletionSpan.retentionExpiresAt).toBeInstanceOf(Date)
      })

      it('handles ClickHouse bulk insert failure gracefully', async () => {
        mocks.bulkCreateClickHouseSpans.mockResolvedValue(
          Result.error(new Error('ClickHouse connection failed')),
        )

        const route = `/api/v3/projects/${projectId}/versions/${commitUuid}/documents/logs`
        const res = await app.request(route, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            path: documentPath,
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        })

        expect(res.status).toBe(200)
        expect(mocks.bulkCreateClickHouseSpans).toHaveBeenCalledTimes(1)
      })
    })

    describe('when ClickHouse feature is disabled', () => {
      it('does not write spans to ClickHouse', async () => {
        mocks.isFeatureEnabledByName.mockResolvedValue(Result.ok(false))

        const route = `/api/v3/projects/${projectId}/versions/${commitUuid}/documents/logs`
        const res = await app.request(route, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            path: documentPath,
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        })

        expect(res.status).toBe(200)
        expect(mocks.bulkCreateClickHouseSpans).not.toHaveBeenCalled()
      })
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
