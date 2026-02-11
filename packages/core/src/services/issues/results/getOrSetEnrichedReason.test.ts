import {
  CompletionSpanMetadata,
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationResultMetadata,
  Providers,
  SPAN_METADATA_STORAGE_KEY,
  SpanType,
} from '@latitude-data/constants'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Message } from '@latitude-data/constants/messages'
import * as env from '@latitude-data/env'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cache as redis } from '../../../cache'
import { database } from '../../../client'
import { diskFactory } from '../../../lib/disk'
import { Result } from '../../../lib/Result'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../../schema/models/types/Workspace'
import * as factories from '../../../tests/factories'
import * as copilotModule from '../../copilot'
import { getOrSetEnrichedReason } from './getOrSetEnrichedReason'

vi.mock('../../copilot', () => ({
  runCopilot: vi.fn(),
}))

describe('getOrSetEnrichedReason', () => {
  const mockRunCopilot = vi.mocked(copilotModule.runCopilot)

  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()

    const projectData = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })

    workspace = projectData.workspace
    commit = projectData.commit
    document = projectData.documents[0]!

    vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      COPILOT_PROMPT_ANNOTATION_GENERALIZER_PATH:
        '/copilot/annotation/generalizer',
    } as typeof env.env)
  })

  async function createPromptSpanWithCompletion({
    traceId,
    input = [
      {
        role: 'user',
        content: [{ type: 'text' as const, text: 'Test question' }],
      },
    ],
    output = [
      {
        role: 'assistant',
        content: [{ type: 'text' as const, text: 'Test answer' }],
        toolCalls: [],
      },
    ],
  }: {
    traceId?: string
    input?: Message[]
    output?: Message[]
  } = {}) {
    const promptSpan = await factories.createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
      traceId,
    })

    const completionSpan = await factories.createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      type: SpanType.Completion,
      traceId: promptSpan.traceId,
      parentId: promptSpan.id,
    })

    const completionMetadata: CompletionSpanMetadata = {
      traceId: completionSpan.traceId,
      spanId: completionSpan.id,
      type: SpanType.Completion,
      attributes: {},
      events: [],
      links: [],
      provider: 'openai',
      model: 'gpt-4o',
      configuration: {},
      input: input as any,
      output: output as any,
    }

    const disk = diskFactory('private')
    const metadataKey = SPAN_METADATA_STORAGE_KEY(
      workspace.id,
      completionSpan.traceId,
      completionSpan.id,
    )
    await disk.put(metadataKey, JSON.stringify(completionMetadata))

    // Clear cache to ensure we read from disk
    const cache = await redis()
    await cache.del(metadataKey)

    return { promptSpan, completionSpan }
  }

  describe('early returns', () => {
    it('returns enriched reason if already present in metadata', async () => {
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const existingEnrichedReason = 'This is an already enriched reason'
      const result = await factories.createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        metadata: {
          configuration: evaluation.configuration,
          actualOutput: 'actual',
          expectedOutput: 'expected',
          reason: 'original reason',
          selectedContexts: [
            {
              messageIndex: 0,
              contentBlockIndex: 0,
              contentType: 'text',
            },
          ],
          enrichedReason: existingEnrichedReason,
        } as HumanEvaluationResultMetadata,
      })

      const enrichedReasonResult = await getOrSetEnrichedReason({
        result,
        evaluation,
      })

      expect(enrichedReasonResult.ok).toBe(true)
      expect(enrichedReasonResult.value).toBe(existingEnrichedReason)
      expect(mockRunCopilot).not.toHaveBeenCalled()
      expect(mockRunCopilot).not.toHaveBeenCalled()
    })

    it('returns initial reason if no selectedContexts in metadata', async () => {
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await factories.createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        metadata: {
          configuration: evaluation.configuration,
          actualOutput: 'actual',
          expectedOutput: 'expected',
          reason: 'original reason',
        } as HumanEvaluationResultMetadata,
      })

      const enrichedReasonResult = await getOrSetEnrichedReason({
        result,
        evaluation,
      })

      expect(enrichedReasonResult.ok).toBe(true)
      // Should return the initial reason from the specification
      expect(enrichedReasonResult.value).toBeTruthy()
      expect(mockRunCopilot).not.toHaveBeenCalled()
      expect(mockRunCopilot).not.toHaveBeenCalled()
    })

    it('returns initial reason if selectedContexts is empty', async () => {
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const reason = 'original reason'
      const result = await factories.createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        metadata: {
          configuration: evaluation.configuration,
          actualOutput: 'actual',
          expectedOutput: 'expected',
          reason,
          selectedContexts: [],
        } as HumanEvaluationResultMetadata,
      })

      const enrichedReasonResult = await getOrSetEnrichedReason({
        result,
        evaluation,
      })

      expect(enrichedReasonResult.ok).toBe(true)
      expect(enrichedReasonResult.value).toBe(reason)
      expect(mockRunCopilot).not.toHaveBeenCalled()
      expect(mockRunCopilot).not.toHaveBeenCalled()
    })

    it('returns initial reason if metadata is null', async () => {
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await factories.createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        metadata: null as any,
      })

      const enrichedReasonResult = await getOrSetEnrichedReason({
        result,
        evaluation,
      })

      expect(enrichedReasonResult.ok).toBe(true)
      expect(enrichedReasonResult.value).toBe('No reason reported')
      expect(mockRunCopilot).not.toHaveBeenCalled()
      expect(mockRunCopilot).not.toHaveBeenCalled()
    })
  })

  describe('error cases', () => {
    it('returns error when evaluation type is not Human', async () => {
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Rule,
      })

      const { promptSpan } = await createPromptSpanWithCompletion()

      const result = await factories.createEvaluationResultV2({
        evaluation,
        span: promptSpan,
        commit,
        workspace,
        metadata: {
          configuration: evaluation.configuration,
          actualOutput: 'actual',
          expectedOutput: 'expected',
          selectedContexts: [
            {
              messageIndex: 0,
              contentBlockIndex: 0,
              contentType: 'text',
            },
          ],
        } as any,
      })

      // Mock runCopilot since generalizeReason is called before the Human type check
      mockRunCopilot.mockResolvedValue(
        Result.ok({
          reasoning: 'reasoning',
          generalized_annotation: 'generalized',
        }),
      )

      const enrichedReasonResult = await getOrSetEnrichedReason({
        result,
        evaluation,
      })

      expect(enrichedReasonResult.ok).toBe(false)
      expect(enrichedReasonResult.error).toBeInstanceOf(BadRequestError)
      expect(enrichedReasonResult.error?.message).toBe(
        'Only human annotations can be enriched',
      )
    })

    it('returns error when COPILOT_PROMPT_ANNOTATION_GENERALIZER_PATH is not set', async () => {
      vi.spyOn(env, 'env', 'get').mockReturnValue({
        ...env.env,
        COPILOT_PROMPT_ANNOTATION_GENERALIZER_PATH: undefined,
      } as typeof env.env)

      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const { promptSpan } = await createPromptSpanWithCompletion()

      const result = await factories.createEvaluationResultV2({
        evaluation,
        span: promptSpan,
        commit,
        workspace,
        metadata: {
          configuration: evaluation.configuration,
          actualOutput: 'actual',
          expectedOutput: 'expected',
          reason: 'original reason',
          selectedContexts: [
            {
              messageIndex: 0,
              contentBlockIndex: 0,
              contentType: 'text',
            },
          ],
        } as HumanEvaluationResultMetadata,
      })

      const enrichedReasonResult = await getOrSetEnrichedReason({
        result,
        evaluation,
      })

      expect(enrichedReasonResult.ok).toBe(false)
      expect(enrichedReasonResult.error?.message).toBe(
        'COPILOT_PROMPT_ANNOTATION_GENERALIZER_PATH is not set',
      )
    })

    it('returns error when runCopilot fails', async () => {
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const { promptSpan } = await createPromptSpanWithCompletion()

      const result = await factories.createEvaluationResultV2({
        evaluation,
        span: promptSpan,
        commit,
        workspace,
        metadata: {
          configuration: evaluation.configuration,
          actualOutput: 'actual',
          expectedOutput: 'expected',
          reason: 'original reason',
          selectedContexts: [
            {
              messageIndex: 0,
              contentBlockIndex: 0,
              contentType: 'text',
            },
          ],
        } as HumanEvaluationResultMetadata,
      })

      mockRunCopilot.mockResolvedValue(
        Result.error(new Error('Failed to run copilot')) as any,
      )

      const enrichedReasonResult = await getOrSetEnrichedReason({
        result,
        evaluation,
      })

      expect(enrichedReasonResult.ok).toBe(false)
      expect(enrichedReasonResult.error?.message).toBe('Failed to run copilot')
      expect(mockRunCopilot).toHaveBeenCalled()
      expect(mockRunCopilot).toHaveBeenCalled()
    })
  })

  describe('successful enrichment', () => {
    it('enriches reason and writes to database when selectedContexts exist', async () => {
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const { promptSpan } = await createPromptSpanWithCompletion()

      const originalReason = 'This is the original reason'
      const enrichedReason = 'This is the enriched and generalized reason'
      const selectedContexts = [
        {
          messageIndex: 0,
          contentBlockIndex: 0,
          contentType: 'text' as const,
          selectedText: 'selected text',
        },
      ]

      const result = await factories.createEvaluationResultV2({
        evaluation,
        span: promptSpan,
        commit,
        workspace,
        metadata: {
          configuration: evaluation.configuration,
          actualOutput: 'actual',
          expectedOutput: 'expected',
          reason: originalReason,
          selectedContexts,
        } as HumanEvaluationResultMetadata,
      })

      mockRunCopilot.mockResolvedValue(
        Result.ok({
          reasoning: 'Some reasoning',
          generalized_annotation: enrichedReason,
        }),
      )

      const enrichedReasonResult = await getOrSetEnrichedReason({
        result,
        evaluation,
      })

      expect(enrichedReasonResult.ok).toBe(true)
      expect(enrichedReasonResult.value).toBe(enrichedReason)

      // Verify copilot was called with correct parameters
      expect(mockRunCopilot).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/copilot/annotation/generalizer',
          parameters: {
            messages: expect.any(Array),
            annotation: originalReason,
            context: expect.stringContaining('"messageIndex":0'),
          },
        }),
      )

      // Verify the enriched reason was written to the database
      const updatedResult = await database
        .select()
        .from(evaluationResultsV2)
        .where(eq(evaluationResultsV2.uuid, result.uuid))
        .then((r) => r[0])

      expect(updatedResult).toBeDefined()
      expect(updatedResult?.metadata).toBeDefined()
      const metadata = updatedResult?.metadata as HumanEvaluationResultMetadata
      expect(metadata.enrichedReason).toBe(enrichedReason)
      expect(metadata.reason).toBe(originalReason)
      expect(metadata.selectedContexts).toEqual(selectedContexts)
    })

    it('preserves existing metadata fields when enriching', async () => {
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const { promptSpan } = await createPromptSpanWithCompletion()

      const originalReason = 'Original reason'
      const enrichedReason = 'Enriched reason'
      const selectedContexts = [
        {
          messageIndex: 1,
          contentBlockIndex: 2,
          contentType: 'text' as const,
        },
      ]

      const result = await factories.createEvaluationResultV2({
        evaluation,
        span: promptSpan,
        commit,
        workspace,
        metadata: {
          configuration: evaluation.configuration,
          actualOutput: 'actual output text',
          expectedOutput: 'expected output text',
          reason: originalReason,
          selectedContexts,
          datasetLabel: 'test-dataset',
        } as HumanEvaluationResultMetadata,
      })

      mockRunCopilot.mockResolvedValue(
        Result.ok({
          reasoning: 'Reasoning',
          generalized_annotation: enrichedReason,
        }),
      )

      await getOrSetEnrichedReason({
        result,
        evaluation,
      }).then((r) => r.unwrap())

      // Verify all metadata fields are preserved
      const updatedResult = await database
        .select()
        .from(evaluationResultsV2)
        .where(eq(evaluationResultsV2.uuid, result.uuid))
        .then((r) => r[0])

      const metadata = updatedResult?.metadata as HumanEvaluationResultMetadata
      expect(metadata.enrichedReason).toBe(enrichedReason)
      expect(metadata.reason).toBe(originalReason)
      expect(metadata.actualOutput).toBe('actual output text')
      expect(metadata.expectedOutput).toBe('expected output text')
      expect(metadata.datasetLabel).toBe('test-dataset')
      expect(metadata.selectedContexts).toEqual(selectedContexts)
    })

    it('does not enrich again if enrichedReason already exists in database', async () => {
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
        type: EvaluationType.Human,
        metric: HumanEvaluationMetric.Binary,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const existingEnrichedReason = 'Already enriched reason'
      const result = await factories.createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        metadata: {
          configuration: evaluation.configuration,
          actualOutput: 'actual',
          expectedOutput: 'expected',
          reason: 'original reason',
          selectedContexts: [
            {
              messageIndex: 0,
              contentBlockIndex: 0,
              contentType: 'text',
            },
          ],
          enrichedReason: existingEnrichedReason,
        } as HumanEvaluationResultMetadata,
      })

      // Fetch fresh result from database to simulate real-world scenario
      const freshResult = await database
        .select()
        .from(evaluationResultsV2)
        .where(eq(evaluationResultsV2.uuid, result.uuid))
        .then((r) => r[0] as typeof result)

      const enrichedReasonResult = await getOrSetEnrichedReason({
        result: freshResult,
        evaluation,
      })

      expect(enrichedReasonResult.ok).toBe(true)
      expect(enrichedReasonResult.value).toBe(existingEnrichedReason)
      expect(mockRunCopilot).not.toHaveBeenCalled()
      expect(mockRunCopilot).not.toHaveBeenCalled()
    })
  })
})
