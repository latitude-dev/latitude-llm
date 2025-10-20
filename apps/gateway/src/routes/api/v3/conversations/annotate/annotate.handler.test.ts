import app from '$/routes/app'
import { Providers } from '@latitude-data/constants'
import { Message, MessageRole } from '@latitude-data/constants/legacyCompiler'
import {
  DocumentLog,
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  LogSources,
} from '@latitude-data/core/constants'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import {
  createDocumentLog,
  createEvaluationV2,
  createProject,
  createProviderLog,
  helpers,
} from '@latitude-data/core/factories'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { ApiKey } from '@latitude-data/core/schema/models/types/ApiKey'
import { describe, expect, it } from 'vitest'

describe('POST /conversations/:conversationUuid/evaluations/:evaluationUuid/annotate', () => {
  // Default test messages for provider logs
  const DEFAULT_MESSAGES = [
    {
      role: MessageRole.user,
      content: [
        {
          type: 'text',
          text: 'Hello World',
        },
      ],
    },
    {
      role: MessageRole.assistant,
      content: [
        {
          type: 'text',
          text: 'Hello! How can I assist you today?',
        },
      ],
      toolCalls: [],
    },
  ]

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
  }

  type TestSetupOptions = {
    providerLogOptions?: Record<string, unknown>
    evaluationOptions?: Record<string, unknown>
    documentOptions?: Record<string, unknown>
  }

  // Helper function to create basic test setup with project, API key, etc.
  async function createTestSetup(options: TestSetupOptions = {}) {
    const {
      providerLogOptions = {},
      evaluationOptions = {},
      documentOptions = {},
    } = options

    // Create project with document
    const { providers, workspace, commit, documents } = await createProject({
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
    const provider = providers[0]!

    // Get API key for authorization
    const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
      workspaceId: workspace.id,
    }).then((r) => r.unwrap())

    const { documentLog } = await createDocumentLog({
      document: documents[0]!,
      commit,
      parameters: { name: 'World' },
      source: LogSources.API,
      skipProviderLogs: true,
    })

    // Create provider log linked to the document log
    const providerLog = await createProviderLog({
      workspace,
      documentLogUuid: documentLog?.uuid || generateUUIDIdentifier(),
      providerId: provider.id,
      providerType: Providers.OpenAI,
      source: LogSources.API,
      messages: DEFAULT_MESSAGES as Message[],
      responseText: 'Hello! How can I assist you today?',
      ...providerLogOptions,
    })

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
      documentLog,
      providerLog,
      evaluation,
    }
  }

  // Helper function to make the annotate request
  async function makeAnnotateRequest({
    documentLog,
    evaluation,
    apiKey,
    requestBody = DEFAULT_REQUEST_BODY,
    queryParams = '',
  }: {
    documentLog: DocumentLog
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
    const route = `/api/v3/conversations/${documentLog.uuid}/evaluations/${evaluation.uuid}/annotate${queryParams}`

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
      const { documentLog, evaluation, apiKey } = await createTestSetup()

      // Make the request
      const res = await makeAnnotateRequest({ documentLog, evaluation, apiKey })

      // Assert response
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data).toHaveProperty('uuid')
      expect(typeof data.uuid).toBe('string')
    })

    it('fails with non-existent evaluation version', async () => {
      const { documentLog, evaluation, apiKey } = await createTestSetup()

      // Make the request with non-existent version UUID
      const res = await makeAnnotateRequest({
        documentLog,
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
      const { documentLog, evaluation, apiKey, commit } =
        await createTestSetup()

      // Make the request without specifying version (should use HEAD_COMMIT)
      const res = await makeAnnotateRequest({ documentLog, evaluation, apiKey })

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
      const { documentLog, evaluation, apiKey, commit } =
        await createTestSetup()

      const customRequestBody = {
        score: 2,
        metadata: {
          reason: 'Response was not helpful',
        },
      }

      // Make the request with custom body
      const res = await makeAnnotateRequest({
        documentLog,
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
