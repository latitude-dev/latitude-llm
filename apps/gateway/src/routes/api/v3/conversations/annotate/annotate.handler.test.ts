import app from '$/routes/app'
import { Providers, Span } from '@latitude-data/constants'
import {
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  LogSources,
  SpanType,
} from '@latitude-data/core/constants'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
import {
  createEvaluationV2,
  createProject,
  createSpan,
  helpers,
} from '@latitude-data/core/factories'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { Result } from '@latitude-data/core/lib/Result'
import { ApiKey } from '@latitude-data/core/schema/models/types/ApiKey'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock SpanMetadatasRepository
const mockGet = vi.fn().mockResolvedValue(Result.ok(null))
const mockGetBatch = vi.fn().mockResolvedValue(new Map())
vi.mock('@latitude-data/core/repositories', async () => {
  const actual = await vi.importActual('@latitude-data/core/repositories')
  return {
    ...actual,
    SpanMetadatasRepository: vi.fn().mockImplementation(() => ({
      get: mockGet,
      getBatch: mockGetBatch,
      invalidate: vi.fn().mockResolvedValue(Result.ok(null)),
    })),
  }
})

const { mockAnnotateEvaluationV2 } = vi.hoisted(() => ({
  mockAnnotateEvaluationV2: vi.fn(),
}))
vi.mock('@latitude-data/core/services/evaluationsV2/annotate', () => ({
  annotateEvaluationV2: mockAnnotateEvaluationV2,
}))

describe('POST /conversations/:conversationUuid/evaluations/:evaluationUuid/annotate', () => {
  beforeEach(() => {
    mockAnnotateEvaluationV2.mockClear()
    mockAnnotateEvaluationV2.mockResolvedValue(Result.ok({}))
  })

  // Default request body for annotation
  const DEFAULT_REQUEST_BODY = {
    score: 4,
    metadata: {
      reason: 'Good response, but could be better',
    },
  }

  // Default evaluation configuration
  const DEFAULT_EVALUATION_CONFIG = {
    reverseScale: false,
    actualOutput: {
      messageSelection: 'last' as const,
      parsingFormat: 'string' as const,
    },
    expectedOutput: {
      parsingFormat: 'string' as const,
    },
    minRating: 1,
    maxRating: 5,
    minThreshold: 3,
  }

  type TestSetupOptions = {
    providerLogOptions?: Record<string, unknown>
    evaluationOptions?: Record<string, unknown>
    documentOptions?: Record<string, unknown>
  }

  // Helper function to create basic test setup with project, API key, etc.
  async function createTestSetup(options: TestSetupOptions = {}) {
    const { evaluationOptions = {}, documentOptions = {} } = options

    // Create project with document
    const { workspace, commit, documents } = await createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        'test-document.md': helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
      ...documentOptions,
    })

    // Get API key for authorization
    const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
      workspaceId: workspace.id,
    })

    const documentLogUuid = generateUUIDIdentifier()
    // Create a prompt span (parent)
    const promptSpan = await createSpan({
      workspaceId: workspace.id,
      documentLogUuid,
      documentUuid: documents[0]!.documentUuid,
      commitUuid: commit.uuid,
      source: LogSources.API,
      type: SpanType.Prompt,
    })

    // Create a completion span (child of the prompt span)
    await createSpan({
      workspaceId: workspace.id,
      documentLogUuid,
      documentUuid: documents[0]!.documentUuid,
      commitUuid: commit.uuid,
      source: LogSources.API,
      type: SpanType.Completion,
      parentId: promptSpan.id,
      traceId: promptSpan.traceId,
    })

    const span = promptSpan

    // Create evaluation for the document
    const evaluation = await createEvaluationV2({
      document: documents[0]!,
      commit,
      workspace,
      type: EvaluationType.Human,
      metric: HumanEvaluationMetric.Rating,
      configuration: DEFAULT_EVALUATION_CONFIG,
      ...evaluationOptions,
    })

    return {
      workspace,
      commit,
      documents,
      apiKey,
      span,
      evaluation,
    }
  }

  // Helper function to setup span metadata mock
  function setupSpanMetadataMock({
    traceId,
    spanId,
    documentUuid,
    commitUuid,
  }: {
    traceId: string
    spanId: string
    documentUuid: string
    commitUuid: string
  }) {
    const mockPromptSpanMetadata = {
      traceId,
      spanId,
      type: 'prompt' as const,
      attributes: {},
      events: [],
      links: [],
      experimentUuid: 'test-experiment-uuid',
      externalId: 'test-external-id',
      parameters: {},
      promptUuid: documentUuid,
      template: 'test template',
      versionUuid: commitUuid,
      source: LogSources.API,
    }

    const mockCompletionSpanMetadata = {
      traceId,
      spanId: 'completion-span-id',
      type: 'completion' as const,
      attributes: {},
      events: [],
      links: [],
      provider: 'openai',
      model: 'gpt-4o',
      configuration: {},
      input: [],
      output: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Hello! How can I assist you today?',
            },
          ],
        },
      ],
      tokens: {
        prompt: 10,
        cached: 0,
        reasoning: 0,
        completion: 15,
      },
    }

    // Mock the get method to return different metadata based on spanId
    mockGet.mockImplementation(({ spanId: requestedSpanId }) => {
      if (requestedSpanId === spanId) {
        return Promise.resolve(Result.ok(mockPromptSpanMetadata))
      }
      return Promise.resolve(Result.ok(mockCompletionSpanMetadata))
    })

    // Mock getBatch to return metadata for all completion spans
    mockGetBatch.mockImplementation(
      (spanIdentifiers: Array<{ traceId: string; spanId: string }>) => {
        const resultMap = new Map()
        for (const { traceId: tid, spanId: sid } of spanIdentifiers) {
          const key = `${tid}:${sid}`
          resultMap.set(key, {
            ...mockCompletionSpanMetadata,
            spanId: sid,
            traceId: tid,
          })
        }
        return Promise.resolve(resultMap)
      },
    )
  }

  // Helper function to make the annotate request
  async function makeAnnotateRequest({
    span,
    evaluation,
    apiKey,
    requestBody = DEFAULT_REQUEST_BODY,
    queryParams = '',
  }: {
    span: Span
    evaluation: EvaluationV2
    apiKey: ApiKey
    requestBody?: {
      score: number
      metadata: {
        reason: string
      }
      versionUuid?: string
    }
    queryParams?: string
  }) {
    const route = `/api/v3/conversations/${span.documentLogUuid}/evaluations/${evaluation.uuid}/annotate${queryParams}`

    return app.request(route, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
  }

  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v3/conversations/fake-uuid/evaluations/fake-eval-uuid/annotate',
        {
          method: 'POST',
          body: JSON.stringify({
            score: 5,
            metadata: {
              reason: 'Test reason',
            },
          }),
        },
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    it('successfully annotates an evaluation', async () => {
      const { span, evaluation, apiKey, documents, commit } =
        await createTestSetup()

      // Setup the span metadata mock
      setupSpanMetadataMock({
        traceId: span.traceId,
        spanId: span.id,
        documentUuid: documents[0]!.documentUuid,
        commitUuid: commit.uuid,
      })

      // Make the request
      const res = await makeAnnotateRequest({ span, evaluation, apiKey })

      // Assert response
      expect(res.status).toBe(202)
      const data = await res.json()
      expect(data).toEqual({
        status: 'accepted',
        message: 'Annotation queued for asynchronous processing',
        resultUuid: expect.any(String),
      })
      expect(mockAnnotateEvaluationV2).toHaveBeenCalled()
    })

    it('fails with non-existent evaluation version', async () => {
      const { span, evaluation, apiKey } = await createTestSetup()

      // Make the request with non-existent version UUID
      const res = await makeAnnotateRequest({
        span,
        evaluation,
        apiKey,
        requestBody: {
          score: 5,
          versionUuid: generateUUIDIdentifier(),
          metadata: {
            reason: 'Test reason',
          },
        },
      })

      // Assert response
      expect(res.status).toBe(404)
    })

    it('succeeds with HEAD_COMMIT when version not specified', async () => {
      const { span, evaluation, apiKey, commit, documents } =
        await createTestSetup()

      // Setup the span metadata mock
      setupSpanMetadataMock({
        traceId: span.traceId,
        spanId: span.id,
        documentUuid: documents[0]!.documentUuid,
        commitUuid: commit.uuid,
      })

      // Make the request without specifying version (should use HEAD_COMMIT)
      const res = await makeAnnotateRequest({ span, evaluation, apiKey })

      // Assert response
      expect(res.status).toBe(202)
      const data = await res.json()
      expect(data).toEqual({
        status: 'accepted',
        message: 'Annotation queued for asynchronous processing',
        resultUuid: expect.any(String),
      })
      expect(mockAnnotateEvaluationV2).toHaveBeenCalledWith(
        expect.objectContaining({
          commit: expect.objectContaining({ uuid: commit.uuid }),
        }),
      )
    })

    it('returns correct data with custom score and metadata', async () => {
      const { span, evaluation, apiKey, commit, documents } =
        await createTestSetup()

      // Setup the span metadata mock
      setupSpanMetadataMock({
        traceId: span.traceId,
        spanId: span.id,
        documentUuid: documents[0]!.documentUuid,
        commitUuid: commit.uuid,
      })

      const customRequestBody = {
        score: 2,
        metadata: {
          reason: 'Response was not helpful',
        },
      }

      // Make the request with custom body
      const res = await makeAnnotateRequest({
        span,
        evaluation,
        apiKey,
        requestBody: customRequestBody,
      })

      // Assert response
      expect(res.status).toBe(202)
      const data = await res.json()
      expect(data).toEqual({
        status: 'accepted',
        message: 'Annotation queued for asynchronous processing',
        resultUuid: expect.any(String),
      })
      expect(mockAnnotateEvaluationV2).toHaveBeenCalledWith(
        expect.objectContaining({
          resultScore: customRequestBody.score,
          resultMetadata: expect.objectContaining(customRequestBody.metadata),
        }),
      )
    })

    it('returns immediately without waiting for annotation processing', async () => {
      const { span, evaluation, apiKey, documents, commit } =
        await createTestSetup()

      setupSpanMetadataMock({
        traceId: span.traceId,
        spanId: span.id,
        documentUuid: documents[0]!.documentUuid,
        commitUuid: commit.uuid,
      })

      mockAnnotateEvaluationV2.mockReturnValueOnce(new Promise(() => {}))

      const res = await makeAnnotateRequest({ span, evaluation, apiKey })

      expect(res.status).toBe(202)
      const data = await res.json()
      expect(data).toEqual({
        status: 'accepted',
        message: 'Annotation queued for asynchronous processing',
        resultUuid: expect.any(String),
      })
    })
  })
})
