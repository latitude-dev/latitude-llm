import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTRIBUTES, Otlp, SpanStatus, SpanType } from '../../../../constants'
import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
} from '@opentelemetry/semantic-conventions/incubating'
import { type ApiKey } from '../../../../schema/models/types/ApiKey'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import * as factories from '../../../../tests/factories'
import { processSpansBulk } from './processBulk'

vi.mock('../../../lib/disk', () => ({
  diskFactory: vi.fn(() => ({
    put: vi.fn().mockResolvedValue({ unwrap: () => undefined }),
  })),
}))

vi.mock('../../../cache', () => ({
  cache: vi.fn().mockResolvedValue({
    del: vi.fn().mockResolvedValue(undefined),
  }),
}))

const publisherSpy = vi.spyOn(
  await import('../../../../events/publisher').then((f) => f.publisher),
  'publishLater',
)

let spanCounter = 0
function generateUniqueId(prefix: string, maxLength: number): string {
  spanCounter++
  const timestamp = Date.now().toString(36)
  const counter = spanCounter.toString(36).padStart(4, '0')
  const id = `${prefix}${timestamp}${counter}`
  return id.slice(0, maxLength)
}

function createOtlpSpan(overrides: Partial<Otlp.Span> = {}): Otlp.Span {
  const now = Date.now() * 1_000_000
  return {
    traceId: generateUniqueId('t', 32),
    spanId: generateUniqueId('s', 16),
    name: 'test-span',
    kind: Otlp.SpanKind.Client,
    startTimeUnixNano: String(now),
    endTimeUnixNano: String(now + 1_000_000_000),
    status: { code: Otlp.StatusCode.Ok },
    attributes: [
      {
        key: ATTRIBUTES.LATITUDE.type,
        value: { stringValue: SpanType.Completion },
      },
      {
        key: ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.system,
        value: { stringValue: 'openai' },
      },
      {
        key: ATTRIBUTES.OPENTELEMETRY.GEN_AI.response.model,
        value: { stringValue: 'gpt-4o' },
      },
    ],
    events: [],
    links: [],
    ...overrides,
  }
}

function createSpanData(
  span: Otlp.Span,
  apiKey: ApiKey,
  workspace: Workspace,
): {
  span: Otlp.Span
  scope: Otlp.Scope
  resource: Otlp.Resource
  apiKey: ApiKey
  workspace: Workspace
} {
  return {
    span,
    scope: { name: 'test-scope', version: '1.0.0' },
    resource: { attributes: [] },
    apiKey,
    workspace,
  }
}

let workspace: Workspace
let apiKey: ApiKey

describe('processSpansBulk', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { workspace: ws } = await factories.createWorkspace()
    workspace = ws
    const { apiKey: key } = await factories.createApiKey({ workspace })
    apiKey = key
  })

  describe('ingesting telemetry data', () => {
    it('persists spans and returns them', async () => {
      const span = createOtlpSpan()
      const result = await processSpansBulk({
        spans: [createSpanData(span, apiKey, workspace)],
        apiKey,
        workspace,
      })

      expect(result.error).toBeUndefined()
      expect(result.value?.spans).toHaveLength(1)
      expect(result.value?.spans[0]?.id).toBe(span.spanId)
      expect(result.value?.spans[0]?.traceId).toBe(span.traceId)
    })

    it('associates spans with the correct workspace and API key', async () => {
      const span = createOtlpSpan()
      const result = await processSpansBulk({
        spans: [createSpanData(span, apiKey, workspace)],
        apiKey,
        workspace,
      })

      expect(result.value?.spans[0]?.workspaceId).toBe(workspace.id)
      expect(result.value?.spans[0]?.apiKeyId).toBe(apiKey.id)
    })

    it('publishes spanCreated events for each span', async () => {
      const span1 = createOtlpSpan()
      const span2 = createOtlpSpan()

      const callsBefore = publisherSpy.mock.calls.length

      await processSpansBulk({
        spans: [
          createSpanData(span1, apiKey, workspace),
          createSpanData(span2, apiKey, workspace),
        ],
        apiKey,
        workspace,
      })

      expect(publisherSpy).toHaveBeenCalledTimes(callsBefore + 2)
      expect(publisherSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'spanCreated',
          data: expect.objectContaining({
            spanId: span1.spanId,
            traceId: span1.traceId,
            workspaceId: workspace.id,
            spanType: SpanType.Completion,
            isConversationRoot: false,
          }),
        }),
      )
    })

    it('publishes spanCreated with isConversationRoot true for root Prompt spans', async () => {
      const promptSpan = createOtlpSpan({
        attributes: [
          {
            key: ATTRIBUTES.LATITUDE.type,
            value: { stringValue: SpanType.Prompt },
          },
        ],
      })

      const callsBefore = publisherSpy.mock.calls.length

      await processSpansBulk({
        spans: [createSpanData(promptSpan, apiKey, workspace)],
        apiKey,
        workspace,
      })

      expect(publisherSpy).toHaveBeenCalledTimes(callsBefore + 1)
      expect(publisherSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'spanCreated',
          data: expect.objectContaining({
            spanId: promptSpan.spanId,
            traceId: promptSpan.traceId,
            spanType: SpanType.Prompt,
            isConversationRoot: true,
          }),
        }),
      )
    })

    it('publishes spanCreated with isConversationRoot false for child Prompt spans', async () => {
      const parentSpan = createOtlpSpan()
      const childPromptSpan = createOtlpSpan({
        parentSpanId: parentSpan.spanId,
        traceId: parentSpan.traceId,
        attributes: [
          {
            key: ATTRIBUTES.LATITUDE.type,
            value: { stringValue: SpanType.Prompt },
          },
        ],
      })

      const callsBefore = publisherSpy.mock.calls.length

      await processSpansBulk({
        spans: [
          createSpanData(parentSpan, apiKey, workspace),
          createSpanData(childPromptSpan, apiKey, workspace),
        ],
        apiKey,
        workspace,
      })

      expect(publisherSpy).toHaveBeenCalledTimes(callsBefore + 2)
      expect(publisherSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'spanCreated',
          data: expect.objectContaining({
            spanId: childPromptSpan.spanId,
            spanType: SpanType.Prompt,
            isConversationRoot: false,
          }),
        }),
      )
    })

    it('processes spans with parent-child relationships', async () => {
      const parentSpan = createOtlpSpan()
      const childSpan = createOtlpSpan({
        parentSpanId: parentSpan.spanId,
        traceId: parentSpan.traceId,
      })

      const result = await processSpansBulk({
        spans: [
          createSpanData(parentSpan, apiKey, workspace),
          createSpanData(childSpan, apiKey, workspace),
        ],
        apiKey,
        workspace,
      })

      expect(result.value?.spans).toHaveLength(2)
      const child = result.value?.spans.find((s) => s.id === childSpan.spanId)
      expect(child?.parentId).toBe(parentSpan.spanId)
    })
  })

  describe('handling duplicate submissions', () => {
    it('skips spans that already exist', async () => {
      const span = createOtlpSpan()

      await processSpansBulk({
        spans: [createSpanData(span, apiKey, workspace)],
        apiKey,
        workspace,
      })

      vi.clearAllMocks()

      const result = await processSpansBulk({
        spans: [createSpanData(span, apiKey, workspace)],
        apiKey,
        workspace,
      })

      expect(result.value).toBeUndefined()
      expect(publisherSpy).not.toHaveBeenCalled()
    })

    it('returns nil when all spans are duplicates', async () => {
      const span1 = createOtlpSpan()
      const span2 = createOtlpSpan()

      await processSpansBulk({
        spans: [
          createSpanData(span1, apiKey, workspace),
          createSpanData(span2, apiKey, workspace),
        ],
        apiKey,
        workspace,
      })

      vi.clearAllMocks()

      const result = await processSpansBulk({
        spans: [
          createSpanData(span1, apiKey, workspace),
          createSpanData(span2, apiKey, workspace),
        ],
        apiKey,
        workspace,
      })

      expect(result.value).toBeUndefined()
    })

    it('persists only new spans in a mixed batch', async () => {
      const existingSpan = createOtlpSpan()
      const newSpan = createOtlpSpan({ traceId: existingSpan.traceId })

      const firstResult = await processSpansBulk({
        spans: [createSpanData(existingSpan, apiKey, workspace)],
        apiKey,
        workspace,
      })
      expect(firstResult.error).toBeUndefined()
      expect(firstResult.value?.spans).toHaveLength(1)

      const result = await processSpansBulk({
        spans: [
          createSpanData(existingSpan, apiKey, workspace),
          createSpanData(newSpan, apiKey, workspace),
        ],
        apiKey,
        workspace,
      })

      expect(result.error).toBeUndefined()
      expect(result.value?.spans).toHaveLength(1)
      expect(result.value?.spans[0]?.id).toBe(newSpan.spanId)
    })
  })

  describe('graceful partial failure', () => {
    it('persists valid spans when some are invalid', async () => {
      const validSpan = createOtlpSpan()
      const invalidSpan = createOtlpSpan({
        kind: 999,
      })

      const result = await processSpansBulk({
        spans: [
          createSpanData(validSpan, apiKey, workspace),
          createSpanData(invalidSpan, apiKey, workspace),
        ],
        apiKey,
        workspace,
      })

      expect(result.value?.spans).toHaveLength(1)
      expect(result.value?.spans[0]?.id).toBe(validSpan.spanId)
    })

    it('returns nil when no spans can be processed', async () => {
      const invalidSpan1 = createOtlpSpan({ kind: 999 })
      const invalidSpan2 = createOtlpSpan({ kind: 999 })

      const result = await processSpansBulk({
        spans: [
          createSpanData(invalidSpan1, apiKey, workspace),
          createSpanData(invalidSpan2, apiKey, workspace),
        ],
        apiKey,
        workspace,
      })

      expect(result.value).toBeUndefined()
    })

    it('handles spans with negative duration', async () => {
      const now = Date.now() * 1_000_000
      const invalidSpan = createOtlpSpan({
        startTimeUnixNano: String(now + 1_000_000_000),
        endTimeUnixNano: String(now),
      })
      const validSpan = createOtlpSpan()

      const result = await processSpansBulk({
        spans: [
          createSpanData(invalidSpan, apiKey, workspace),
          createSpanData(validSpan, apiKey, workspace),
        ],
        apiKey,
        workspace,
      })

      expect(result.value?.spans).toHaveLength(1)
      expect(result.value?.spans[0]?.id).toBe(validSpan.spanId)
    })

    it('handles empty batch', async () => {
      const result = await processSpansBulk({
        spans: [],
        apiKey,
        workspace,
      })

      expect(result.value).toBeUndefined()
    })
  })

  describe('multi-SDK compatibility', () => {
    it('processes spans from Latitude SDK format (latitude.type)', async () => {
      const span = createOtlpSpan({
        attributes: [
          {
            key: ATTRIBUTES.LATITUDE.type,
            value: { stringValue: SpanType.Completion },
          },
          {
            key: ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.system,
            value: { stringValue: 'openai' },
          },
          {
            key: ATTRIBUTES.OPENTELEMETRY.GEN_AI.response.model,
            value: { stringValue: 'gpt-4o' },
          },
        ],
      })

      const result = await processSpansBulk({
        spans: [createSpanData(span, apiKey, workspace)],
        apiKey,
        workspace,
      })

      expect(result.value?.spans[0]?.type).toBe(SpanType.Completion)
    })

    it('processes spans from OpenTelemetry GenAI conventions', async () => {
      const span = createOtlpSpan({
        attributes: [
          {
            key: ATTRIBUTES.OPENTELEMETRY.GEN_AI.operation,
            value: { stringValue: GEN_AI_OPERATION_NAME_VALUE_CHAT },
          },
          {
            key: ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.system,
            value: { stringValue: 'openai' },
          },
          {
            key: ATTRIBUTES.OPENTELEMETRY.GEN_AI.response.model,
            value: { stringValue: 'gpt-4o' },
          },
        ],
      })

      const result = await processSpansBulk({
        spans: [createSpanData(span, apiKey, workspace)],
        apiKey,
        workspace,
      })

      expect(result.value?.spans[0]?.type).toBe(SpanType.Completion)
    })

    it('processes spans from Vercel AI SDK format', async () => {
      const span = createOtlpSpan({
        attributes: [
          {
            key: ATTRIBUTES.AI_SDK.operationId,
            value: { stringValue: 'ai.generateText.doGenerate' },
          },
          {
            key: ATTRIBUTES.AI_SDK.model.provider,
            value: { stringValue: 'openai' },
          },
          { key: ATTRIBUTES.AI_SDK.model.id, value: { stringValue: 'gpt-4o' } },
        ],
      })

      const result = await processSpansBulk({
        spans: [createSpanData(span, apiKey, workspace)],
        apiKey,
        workspace,
      })

      expect(result.value?.spans[0]?.type).toBe(SpanType.Completion)
    })

    it('processes embedding spans correctly', async () => {
      const span = createOtlpSpan({
        attributes: [
          {
            key: ATTRIBUTES.OPENTELEMETRY.GEN_AI.operation,
            value: { stringValue: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS },
          },
        ],
      })

      const result = await processSpansBulk({
        spans: [createSpanData(span, apiKey, workspace)],
        apiKey,
        workspace,
      })

      expect(result.value?.spans[0]?.type).toBe(SpanType.Embedding)
    })
  })

  describe('span data extraction', () => {
    it('extracts span name (truncated to 128 chars)', async () => {
      const longName = 'a'.repeat(200)
      const span = createOtlpSpan({ name: longName })

      const result = await processSpansBulk({
        spans: [createSpanData(span, apiKey, workspace)],
        apiKey,
        workspace,
      })

      expect(result.value?.spans[0]?.name).toHaveLength(128)
    })

    it('extracts error status and message', async () => {
      const span = createOtlpSpan({
        status: {
          code: Otlp.StatusCode.Error,
          message: 'Something went wrong',
        },
      })

      const result = await processSpansBulk({
        spans: [createSpanData(span, apiKey, workspace)],
        apiKey,
        workspace,
      })

      expect(result.value?.spans[0]?.status).toBe(SpanStatus.Error)
      expect(result.value?.spans[0]?.message).toBe('Something went wrong')
    })
  })
})
