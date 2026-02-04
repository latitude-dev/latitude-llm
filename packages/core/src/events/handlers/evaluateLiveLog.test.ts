import {
  EvaluationType,
  EvaluationTriggerMode,
  LlmEvaluationMetric,
  LogSources,
  Providers,
  SpanType,
} from '@latitude-data/constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as factories from '../../tests/factories'
import { evaluateLiveLogJob } from './evaluateLiveLog'
import { SpanCreatedEvent } from '../events'
import { Workspace } from '../../schema/models/types/Workspace'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { SpanMetadatasRepository } from '../../repositories'
import { generateUUIDIdentifier } from '../../lib/generateUUID'

const mocks = vi.hoisted(() => ({
  evaluationsQueueAdd: vi.fn(),
}))

vi.mock('../../jobs/queues', () => ({
  queues: vi.fn().mockResolvedValue({
    evaluationsQueue: {
      add: mocks.evaluationsQueueAdd,
    },
  }),
}))

const LLM_BINARY_CONFIG = {
  reverseScale: false,
  actualOutput: {
    messageSelection: 'last' as const,
    parsingFormat: 'string' as const,
  },
  provider: 'openai',
  model: 'gpt-4o',
  criteria: 'test criteria',
  passDescription: 'pass',
  failDescription: 'fail',
}

function buildSpanCreatedEvent(span: {
  id: string
  traceId: string
  workspaceId: number
  apiKeyId: number
  documentUuid?: string
}): SpanCreatedEvent {
  return {
    type: 'spanCreated',
    data: {
      spanId: span.id,
      traceId: span.traceId,
      workspaceId: span.workspaceId,
      apiKeyId: span.apiKeyId,
      documentUuid: span.documentUuid,
    },
  }
}

describe('evaluateLiveLogJob', () => {
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion

  beforeEach(async () => {
    vi.clearAllMocks()

    const setup = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Test prompt',
        }),
      },
    })
    workspace = setup.workspace
    commit = setup.commit
    document = setup.documents[0]!

    vi.spyOn(SpanMetadatasRepository.prototype, 'get').mockResolvedValue({
      ok: true,
      value: {
        input: [],
        output: [],
      },
      unwrap: () => ({ input: [], output: [] }),
    } as any)
  })

  describe('FirstInteraction mode', () => {
    it('enqueues evaluation for Prompt span type', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.FirstInteraction,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({
          workspaceId: workspace.id,
          commitId: commit.id,
          spanId: span.id,
          traceId: span.traceId,
        }),
        expect.any(Object),
      )
    })

    it('enqueues evaluation for External span type', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.FirstInteraction,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.External,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({
          spanId: span.id,
        }),
        expect.any(Object),
      )
    })

    it('does NOT enqueue evaluation for Chat span type', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.FirstInteraction,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Chat,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).not.toHaveBeenCalled()
    })
  })

  describe('EveryInteraction mode', () => {
    it('enqueues evaluation for Prompt span type', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.EveryInteraction,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({
          spanId: span.id,
        }),
        expect.any(Object),
      )
    })

    it('enqueues evaluation for Chat span type', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.EveryInteraction,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Chat,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({
          spanId: span.id,
        }),
        expect.any(Object),
      )
    })

    it('enqueues evaluation for External span type', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.EveryInteraction,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.External,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({
          spanId: span.id,
        }),
        expect.any(Object),
      )
    })
  })

  describe('Debounced mode', () => {
    it('enqueues debounced evaluation with default delay', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.Debounced,
          debounceSeconds: 60,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).toHaveBeenCalledWith(
        'debouncedEvaluationJob',
        expect.objectContaining({
          spanId: span.id,
        }),
        expect.objectContaining({
          delay: 60 * 1000,
        }),
      )
    })

    it('enqueues debounced evaluation with custom delay', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.Debounced,
          debounceSeconds: 120,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).toHaveBeenCalledWith(
        'debouncedEvaluationJob',
        expect.objectContaining({
          spanId: span.id,
        }),
        expect.objectContaining({
          delay: 120 * 1000,
        }),
      )
    })

    it('enqueues debounced evaluation for Chat span type', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.Debounced,
          debounceSeconds: 30,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Chat,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).toHaveBeenCalledWith(
        'debouncedEvaluationJob',
        expect.objectContaining({
          spanId: span.id,
        }),
        expect.objectContaining({
          delay: 30 * 1000,
        }),
      )
    })
  })

  describe('disabled evaluations', () => {
    it('does NOT enqueue evaluation when live evaluation is disabled', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.Disabled,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).not.toHaveBeenCalled()
    })
  })

  describe('non-evaluable log sources', () => {
    it('does NOT enqueue evaluation for Experiment source', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.EveryInteraction,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.Experiment,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).not.toHaveBeenCalled()
    })

    it('does NOT enqueue evaluation for Evaluation source', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.EveryInteraction,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.Evaluation,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).not.toHaveBeenCalled()
    })

    it('does NOT enqueue evaluation for Optimization source', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.EveryInteraction,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.Optimization,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).not.toHaveBeenCalled()
    })
  })

  describe('non-evaluable span types', () => {
    it('does NOT enqueue evaluation for Completion span type', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.EveryInteraction,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Completion,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).not.toHaveBeenCalled()
    })
  })

  describe('multiple evaluations', () => {
    it('enqueues correct job type for each evaluation based on mode', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        name: 'first-interaction-eval',
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.FirstInteraction,
        },
      })

      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        name: 'every-interaction-eval',
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.EveryInteraction,
        },
      })

      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        name: 'debounced-eval',
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.Debounced,
          debounceSeconds: 45,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).toHaveBeenCalledTimes(3)

      const calls = mocks.evaluationsQueueAdd.mock.calls
      const jobTypes = calls.map((call) => call[0])

      expect(jobTypes).toContain('runEvaluationV2Job')
      expect(jobTypes).toContain('debouncedEvaluationJob')

      const debouncedCall = calls.find(
        (call) => call[0] === 'debouncedEvaluationJob',
      )
      expect(debouncedCall?.[2]).toMatchObject({
        delay: 45 * 1000,
      })
    })

    it('only enqueues non-FirstInteraction evaluations for Chat span', async () => {
      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        name: 'first-interaction-eval',
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.FirstInteraction,
        },
      })

      await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        name: 'every-interaction-eval',
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: LLM_BINARY_CONFIG,
        trigger: {
          mode: EvaluationTriggerMode.EveryInteraction,
        },
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Chat,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      const event = buildSpanCreatedEvent(span)

      await evaluateLiveLogJob({ data: event })

      expect(mocks.evaluationsQueueAdd).toHaveBeenCalledTimes(1)
      expect(mocks.evaluationsQueueAdd).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.any(Object),
        expect.any(Object),
      )
    })
  })
})
