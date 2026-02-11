import app from '$/routes/app'
import { Providers, Span } from '@latitude-data/constants'
import {
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  LogSources,
  SpanType,
} from '@latitude-data/core/constants'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import {
  createEvaluationV2,
  createProject,
  createSpan,
  helpers,
} from '@latitude-data/core/factories'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { Result } from '@latitude-data/core/lib/Result'
import { ApiKey } from '@latitude-data/core/schema/models/types/ApiKey'
import { describe, expect, it, vi } from 'vitest'

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

describe('POST /conversations/:conversationUuid/evaluations/:evaluationUuid/annotate', () => {
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
    }).then((r) => r.unwrap())

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
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data).toHaveProperty('uuid')
      expect(typeof data.uuid).toBe('string')
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
      expect(res.status).toBe(201)
      const data = await res.json()

      // Verify complete response structure
      expect(data).toHaveProperty('uuid')
      expect(typeof data.uuid).toBe('string')
      expect(data).toHaveProperty('versionUuid')
      expect(data.versionUuid).toBe(commit.uuid)
      expect(data).toHaveProperty('score')
      expect(data.score).toBe(DEFAULT_REQUEST_BODY.score)
      expect(data).toHaveProperty('metadata')
      expect(data).toHaveProperty('createdAt')
      expect(data).toHaveProperty('updatedAt')

      // Optional fields that might be null but should exist
      expect(data).toHaveProperty('normalizedScore')
      expect(data).toHaveProperty('hasPassed')
      expect(data).toHaveProperty('error')
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
      expect(res.status).toBe(201)
      const data = await res.json()

      // Verify the custom values are returned correctly
      expect(data).toHaveProperty('uuid')
      expect(data).toHaveProperty('versionUuid')
      expect(data.versionUuid).toBe(commit.uuid)
      expect(data).toHaveProperty('score')
      expect(data.score).toBe(customRequestBody.score)
      expect(data).toHaveProperty('metadata')
      expect(data).toHaveProperty('createdAt')
      expect(data).toHaveProperty('updatedAt')
    })
  })
})
