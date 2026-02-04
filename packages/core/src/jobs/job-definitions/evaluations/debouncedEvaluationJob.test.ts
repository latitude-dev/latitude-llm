import {
  EvaluationType,
  EvaluationV2,
  EvaluationTriggerMode,
  LlmEvaluationMetric,
  LogSources,
  Providers,
  SpanType,
} from '@latitude-data/constants'
import { faker } from '@faker-js/faker'
import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SpanMetadatasRepository } from '../../../repositories'
import { Commit } from '../../../schema/models/types/Commit'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { Workspace } from '../../../schema/models/types/Workspace'
import * as evaluationsV2Run from '../../../services/evaluationsV2/run'
import * as factories from '../../../tests/factories'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { debouncedEvaluationJob } from './debouncedEvaluationJob'
import { DebouncedEvaluationJobData } from './runEvaluationV2Job'

const runEvaluationV2Spy = vi.spyOn(evaluationsV2Run, 'runEvaluationV2')

vi.mock('../../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
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

describe('debouncedEvaluationJob', () => {
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>

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

    evaluation = (await factories.createEvaluationV2({
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
    })) as EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>

    vi.spyOn(SpanMetadatasRepository.prototype, 'get').mockResolvedValue({
      ok: true,
      value: {
        input: [],
        output: [],
      },
      unwrap: () => ({ input: [], output: [] }),
    } as any)
  })

  describe('when span is still the latest in trace', () => {
    it('runs the evaluation', async () => {
      const span = await factories.createSpan({
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: generateUUIDIdentifier(),
        source: LogSources.API,
      })

      runEvaluationV2Spy.mockResolvedValueOnce({
        ok: true,
        value: {
          result: {
            hasPassed: true,
            normalizedScore: 1,
            error: null,
          },
        },
        unwrap: vi.fn(),
      } as any)

      const jobData: Job<DebouncedEvaluationJobData> = {
        id: '1',
        data: {
          workspaceId: workspace.id,
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
          spanId: span.id,
          traceId: span.traceId,
        },
      } as Job<DebouncedEvaluationJobData>

      await debouncedEvaluationJob(jobData)

      expect(runEvaluationV2Spy).toHaveBeenCalledWith({
        evaluation: expect.objectContaining({
          uuid: evaluation.uuid,
        }),
        span: expect.objectContaining({
          id: span.id,
          traceId: span.traceId,
        }),
        commit: expect.objectContaining({
          id: commit.id,
        }),
        workspace: expect.objectContaining({
          id: workspace.id,
        }),
      })
    })
  })

  describe('when a newer span exists in the trace', () => {
    it('does NOT run the evaluation', async () => {
      const traceId = faker.string.alpha({ length: 32 })
      const documentLogUuid = generateUUIDIdentifier()

      const olderSpan = await factories.createSpan({
        traceId,
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid,
        source: LogSources.API,
        startedAt: new Date('2024-01-01T10:00:00Z'),
      })

      await factories.createSpan({
        traceId,
        workspaceId: workspace.id,
        type: SpanType.Chat,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid,
        source: LogSources.API,
        startedAt: new Date('2024-01-01T10:05:00Z'),
      })

      const jobData: Job<DebouncedEvaluationJobData> = {
        id: '1',
        data: {
          workspaceId: workspace.id,
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
          spanId: olderSpan.id,
          traceId: traceId,
        },
      } as Job<DebouncedEvaluationJobData>

      await debouncedEvaluationJob(jobData)

      expect(runEvaluationV2Spy).not.toHaveBeenCalled()
    })
  })

  describe('when the original span does not exist', () => {
    it('does NOT run the evaluation', async () => {
      const jobData: Job<DebouncedEvaluationJobData> = {
        id: '1',
        data: {
          workspaceId: workspace.id,
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
          spanId: 'non-existent-span-id',
          traceId: 'non-existent-trace-id',
        },
      } as Job<DebouncedEvaluationJobData>

      await debouncedEvaluationJob(jobData)

      expect(runEvaluationV2Spy).not.toHaveBeenCalled()
    })
  })

  describe('debounce behavior with multiple spans', () => {
    it('only evaluates when triggered span is the latest in the conversation', async () => {
      const traceId = faker.string.alpha({ length: 32 })
      const documentLogUuid = generateUUIDIdentifier()

      const promptSpan = await factories.createSpan({
        traceId,
        workspaceId: workspace.id,
        type: SpanType.Prompt,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid,
        source: LogSources.API,
        startedAt: new Date('2024-01-01T10:00:00Z'),
      })

      const chat1 = await factories.createSpan({
        traceId,
        workspaceId: workspace.id,
        type: SpanType.Chat,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid,
        source: LogSources.API,
        startedAt: new Date('2024-01-01T10:01:00Z'),
      })

      const chat2 = await factories.createSpan({
        traceId,
        workspaceId: workspace.id,
        type: SpanType.Chat,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid,
        source: LogSources.API,
        startedAt: new Date('2024-01-01T10:02:00Z'),
      })

      runEvaluationV2Spy.mockResolvedValue({
        ok: true,
        value: {
          result: {
            hasPassed: true,
            normalizedScore: 1,
            error: null,
          },
        },
        unwrap: vi.fn(),
      } as any)

      const jobForPrompt: Job<DebouncedEvaluationJobData> = {
        id: '1',
        data: {
          workspaceId: workspace.id,
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
          spanId: promptSpan.id,
          traceId,
        },
      } as Job<DebouncedEvaluationJobData>

      await debouncedEvaluationJob(jobForPrompt)
      expect(runEvaluationV2Spy).not.toHaveBeenCalled()

      const jobForChat1: Job<DebouncedEvaluationJobData> = {
        id: '2',
        data: {
          workspaceId: workspace.id,
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
          spanId: chat1.id,
          traceId,
        },
      } as Job<DebouncedEvaluationJobData>

      await debouncedEvaluationJob(jobForChat1)
      expect(runEvaluationV2Spy).not.toHaveBeenCalled()

      const jobForChat2: Job<DebouncedEvaluationJobData> = {
        id: '3',
        data: {
          workspaceId: workspace.id,
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
          spanId: chat2.id,
          traceId,
        },
      } as Job<DebouncedEvaluationJobData>

      await debouncedEvaluationJob(jobForChat2)
      expect(runEvaluationV2Spy).toHaveBeenCalledTimes(1)

      expect(runEvaluationV2Spy).toHaveBeenCalledWith(
        expect.objectContaining({
          span: expect.objectContaining({
            id: chat2.id,
          }),
        }),
      )
    })
  })

  describe('error handling', () => {
    it('throws NotFoundError when workspace does not exist', async () => {
      const jobData: Job<DebouncedEvaluationJobData> = {
        id: '1',
        data: {
          workspaceId: 999999,
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
          spanId: 'span-id',
          traceId: 'trace-id',
        },
      } as Job<DebouncedEvaluationJobData>

      await expect(debouncedEvaluationJob(jobData)).rejects.toThrow(
        'Workspace not found',
      )
    })
  })
})
