import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SpanType } from '../../../constants'
import { Result } from '../../../lib/Result'
import { evaluateFactory } from './evaluate'

const mocks = vi.hoisted(() => ({
  scanDocumentContent: vi.fn(),
  runDocumentAtCommit: vi.fn(),
  runEvaluationV2: vi.fn(),
  getEvaluationMetricSpecification: vi.fn(),
  generateSimulatedUserAction: vi.fn(),
  addMessages: vi.fn(),
  listByDocumentLogUuid: vi.fn(),
  metadataGet: vi.fn(),
}))

vi.mock('../../documents', () => ({
  scanDocumentContent: mocks.scanDocumentContent,
}))

vi.mock('../../commits/runDocumentAtCommit', () => ({
  runDocumentAtCommit: mocks.runDocumentAtCommit,
}))

vi.mock('../../evaluationsV2/run', () => ({
  runEvaluationV2: mocks.runEvaluationV2,
}))

vi.mock('../../evaluationsV2/specifications', () => ({
  getEvaluationMetricSpecification: mocks.getEvaluationMetricSpecification,
}))

vi.mock('../../simulation/simulateUserResponse', () => ({
  generateSimulatedUserAction: mocks.generateSimulatedUserAction,
}))

vi.mock('../../addMessages', () => ({
  addMessages: mocks.addMessages,
}))

vi.mock('../../../repositories/spansRepository', () => ({
  SpansRepository: vi.fn().mockImplementation(() => ({
    listByDocumentLogUuid: mocks.listByDocumentLogUuid,
  })),
  SpanMetadatasRepository: vi.fn().mockImplementation(() => ({
    get: mocks.metadataGet,
  })),
}))

vi.mock('../../../telemetry', () => ({
  BACKGROUND: vi.fn().mockReturnValue({}),
}))

vi.mock('../../../events/publisher', () => ({
  publisher: { publishLater: vi.fn() },
}))

function createMockSpan(
  id: string,
  type: SpanType = SpanType.Prompt,
  startedAt = new Date(),
) {
  return {
    id,
    traceId: `trace-${id}`,
    type,
    startedAt,
    workspaceId: 1,
    documentLogUuid: 'test-log-uuid',
  }
}

function createMockMetadata(spanType: SpanType = SpanType.Prompt) {
  return { spanType, actualOutput: 'test output' }
}

function mockScanDocumentContent() {
  mocks.scanDocumentContent.mockResolvedValue(
    Result.ok({
      parameters: new Set<string>(),
      config: { provider: 'openai', model: 'gpt-4o' },
      instructions: 'test instructions',
      errors: [],
    }),
  )
}

function mockRunDocumentAtCommit(uuid = 'test-log-uuid') {
  mocks.runDocumentAtCommit.mockResolvedValue(
    Result.ok({
      uuid,
      error: Promise.resolve(null),
      messages: Promise.resolve([
        { role: 'assistant', content: [{ type: 'text', text: 'response' }] },
      ]),
      duration: Promise.resolve(100),
      runUsage: Promise.resolve({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      }),
    }),
  )
}

function mockEvaluation(
  score: number,
  passed: boolean,
  reason = 'test reason',
) {
  mocks.runEvaluationV2.mockResolvedValue(
    Result.ok({
      result: {
        normalizedScore: score,
        hasPassed: passed,
        metadata: { actualOutput: 'test output' },
        error: null,
      },
    }),
  )
  mocks.getEvaluationMetricSpecification.mockReturnValue({
    resultReason: () => reason,
  })
}

function mockEvaluationSequence(
  evaluations: { score: number; passed: boolean; reason?: string }[],
) {
  for (const e of evaluations) {
    mocks.runEvaluationV2.mockResolvedValueOnce(
      Result.ok({
        result: {
          normalizedScore: e.score,
          hasPassed: e.passed,
          metadata: { actualOutput: 'test output' },
          error: null,
        },
      }),
    )
  }
  mocks.getEvaluationMetricSpecification.mockReturnValue({
    resultReason: () => 'test reason',
  })
}

function mockSpansAndMetadata(
  spans: ReturnType<typeof createMockSpan>[],
) {
  mocks.listByDocumentLogUuid.mockResolvedValue(spans)
  mocks.metadataGet.mockImplementation(
    async ({ spanId }: { spanId: string }) => {
      const span = spans.find((s) => s.id === spanId)
      if (!span) return Result.ok(null)
      return Result.ok(createMockMetadata(span.type))
    },
  )
}

const baseDocument = {
  id: 1,
  documentUuid: 'doc-uuid',
  path: 'test-prompt',
  content: '---\nprovider: openai\nmodel: gpt-4o\n---\nHello',
  commitId: 1,
  workspaceId: 1,
} as any

const baseCommit = { id: 1, uuid: 'commit-uuid' } as any
const baseWorkspace = { id: 1 } as any

const baseOptimization = {
  id: 1,
  uuid: 'opt-uuid',
  baselinePrompt: '---\nprovider: openai\nmodel: gpt-4o\n---\nHello',
  configuration: {},
} as any

const baseExample = {
  id: 1,
  datasetId: 1,
  workspaceId: 1,
  rowData: {},
} as any

function createEvaluation(triggerTarget?: 'first' | 'every' | 'last') {
  const config: any = {
    reverseScale: false,
    actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
  }
  if (triggerTarget) {
    config.trigger = { target: triggerTarget }
  }
  return {
    uuid: 'eval-uuid',
    versionId: 1,
    workspaceId: 1,
    type: 'rule',
    metric: 'exact_match',
    configuration: config,
  } as any
}

describe('evaluateFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockScanDocumentContent()
  })

  describe('trigger target selection', () => {
    it('evaluates only the first span when trigger target is first', async () => {
      const evaluation = createEvaluation('first')
      mockRunDocumentAtCommit()
      mockEvaluation(80, true)

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createMockSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
        createMockSpan('span-3', SpanType.Prompt, new Date('2024-01-01T00:02:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(mocks.runEvaluationV2).toHaveBeenCalledTimes(1)
      expect(mocks.metadataGet).toHaveBeenCalledWith(
        expect.objectContaining({ spanId: 'span-1' }),
      )
    })

    it('evaluates only the last span when trigger target is last', async () => {
      const evaluation = createEvaluation('last')
      mockRunDocumentAtCommit()
      mockEvaluation(90, true)

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createMockSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
        createMockSpan('span-3', SpanType.Prompt, new Date('2024-01-01T00:02:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(mocks.runEvaluationV2).toHaveBeenCalledTimes(1)
      expect(mocks.metadataGet).toHaveBeenCalledWith(
        expect.objectContaining({ spanId: 'span-3' }),
      )
    })

    it('evaluates all spans when trigger target is every', async () => {
      const evaluation = createEvaluation('every')
      mockRunDocumentAtCommit()
      mockEvaluationSequence([
        { score: 70, passed: true },
        { score: 80, passed: true },
        { score: 90, passed: true },
      ])

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createMockSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
        createMockSpan('span-3', SpanType.Prompt, new Date('2024-01-01T00:02:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(mocks.runEvaluationV2).toHaveBeenCalledTimes(3)
    })

    it('defaults to every when no trigger is configured', async () => {
      const evaluation = createEvaluation()
      mockRunDocumentAtCommit()
      mockEvaluationSequence([
        { score: 60, passed: false },
        { score: 80, passed: true },
      ])

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createMockSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(mocks.runEvaluationV2).toHaveBeenCalledTimes(2)
    })

    it('filters out non-main spans before applying trigger', async () => {
      const evaluation = createEvaluation('every')
      mockRunDocumentAtCommit()
      mockEvaluationSequence([
        { score: 75, passed: true },
        { score: 85, passed: true },
      ])

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createMockSpan('tool-span', SpanType.Tool, new Date('2024-01-01T00:00:30Z')),
        createMockSpan('completion-span', SpanType.Completion, new Date('2024-01-01T00:00:45Z')),
        createMockSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(mocks.runEvaluationV2).toHaveBeenCalledTimes(2)
    })
  })

  describe('aggregation of evaluation results', () => {
    it('averages scores across all spans for every trigger', async () => {
      const evaluation = createEvaluation('every')
      mockRunDocumentAtCommit()
      mockEvaluationSequence([
        { score: 60, passed: true },
        { score: 80, passed: true },
        { score: 100, passed: true },
      ])

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createMockSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
        createMockSpan('span-3', SpanType.Prompt, new Date('2024-01-01T00:02:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      const trajectory = result.value!
      expect(trajectory.score).toBeCloseTo(80 / 100, 2)
    })

    it('fails passed if any span evaluation fails', async () => {
      const evaluation = createEvaluation('every')
      mockRunDocumentAtCommit()
      mockEvaluationSequence([
        { score: 90, passed: true },
        { score: 30, passed: false },
      ])

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createMockSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(result.value!.passed).toBe(false)
    })

    it('includes turn labels in feedback for multi-span evaluation', async () => {
      const evaluation = createEvaluation('every')
      mockRunDocumentAtCommit()
      mockEvaluationSequence([
        { score: 70, passed: true },
        { score: 90, passed: true },
      ])

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createMockSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(result.value!.feedback).toContain('[Turn 1]')
      expect(result.value!.feedback).toContain('[Turn 2]')
    })

    it('returns single result directly for first trigger', async () => {
      const evaluation = createEvaluation('first')
      mockRunDocumentAtCommit()
      mockEvaluation(85, true)

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createMockSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(result.value!.feedback).not.toContain('[Turn')
    })
  })

  describe('multi-turn simulation', () => {
    const simulationOptimization = {
      ...baseOptimization,
      configuration: {
        simulation: {
          simulateToolResponses: true,
          simulatedTools: [],
          toolSimulationInstructions: '',
          maxTurns: 3,
          simulatedUserGoal: 'Test the agent',
        },
      },
    }

    it('runs simulation when maxTurns > 1', async () => {
      const evaluation = createEvaluation('last')
      mockRunDocumentAtCommit()
      mockEvaluation(80, true)

      mocks.generateSimulatedUserAction
        .mockResolvedValueOnce(
          Result.ok({ action: 'continue', message: 'Turn 2 message' }),
        )
        .mockResolvedValueOnce(Result.ok({ action: 'end', message: '' }))

      const addMessagesResult = {
        error: Promise.resolve(null),
        messages: Promise.resolve([
          { role: 'user', content: [{ type: 'text', text: 'Turn 2 message' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Response 2' }] },
        ]),
      }
      mocks.addMessages.mockResolvedValue(Result.ok(addMessagesResult))

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createMockSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: simulationOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(mocks.generateSimulatedUserAction).toHaveBeenCalledTimes(2)
      expect(mocks.addMessages).toHaveBeenCalledTimes(1)
    })

    it('waits for correct number of main spans based on turnsExecuted', async () => {
      const evaluation = createEvaluation('every')
      mockRunDocumentAtCommit()
      mockEvaluationSequence([
        { score: 70, passed: true },
        { score: 90, passed: true },
      ])

      mocks.generateSimulatedUserAction
        .mockResolvedValueOnce(
          Result.ok({ action: 'continue', message: 'Turn 2 message' }),
        )
        .mockResolvedValueOnce(Result.ok({ action: 'end', message: '' }))

      const addMessagesResult = {
        error: Promise.resolve(null),
        messages: Promise.resolve([
          { role: 'assistant', content: [{ type: 'text', text: 'Response 1' }] },
          { role: 'user', content: [{ type: 'text', text: 'Turn 2 message' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Response 2' }] },
        ]),
      }
      mocks.addMessages.mockResolvedValue(Result.ok(addMessagesResult))

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createMockSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: simulationOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(mocks.runEvaluationV2).toHaveBeenCalledTimes(2)
    })

    it('does not simulate when maxTurns is 1', async () => {
      const noSimulationOpt = {
        ...baseOptimization,
        configuration: {
          simulation: {
            simulateToolResponses: true,
            simulatedTools: [],
            toolSimulationInstructions: '',
            maxTurns: 1,
          },
        },
      }

      const evaluation = createEvaluation('last')
      mockRunDocumentAtCommit()
      mockEvaluation(80, true)

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: noSimulationOpt,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(mocks.generateSimulatedUserAction).not.toHaveBeenCalled()
      expect(mocks.addMessages).not.toHaveBeenCalled()
    })

    it('does not simulate when no simulation config exists', async () => {
      const evaluation = createEvaluation('last')
      mockRunDocumentAtCommit()
      mockEvaluation(80, true)

      const spans = [
        createMockSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
      ]
      mockSpansAndMetadata(spans)

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(true)
      expect(mocks.generateSimulatedUserAction).not.toHaveBeenCalled()
    })

    it('returns error on simulation error', async () => {
      const evaluation = createEvaluation('last')
      mockRunDocumentAtCommit()

      mocks.generateSimulatedUserAction.mockResolvedValue(
        Result.error(new Error('Simulation failed')),
      )

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: simulationOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const result = await evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain('Simulation failed')
    })
  })

  describe('span waiting', () => {
    it('times out when expected spans do not appear', async () => {
      vi.useFakeTimers()

      const evaluation = createEvaluation('last')
      mockRunDocumentAtCommit()

      mocks.listByDocumentLogUuid.mockResolvedValue([])

      const evaluate = await evaluateFactory({
        columns: [],
        evaluation,
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const resultPromise = evaluate({
        prompt: baseDocument.content,
        example: baseExample,
      })

      for (let i = 0; i < 15; i++) {
        await vi.advanceTimersByTimeAsync(3000)
      }

      const result = await resultPromise

      vi.useRealTimers()

      expect(result.ok).toBe(false)
      expect(result.error!.message).toContain(
        'Expected main spans did not appear',
      )
    })

    it('handles single span correctly for all trigger targets', async () => {
      for (const target of ['first', 'every', 'last'] as const) {
        vi.clearAllMocks()
        mockScanDocumentContent()
        mockRunDocumentAtCommit()
        mockEvaluation(75, true)

        const spans = [
          createMockSpan('only-span', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        ]
        mockSpansAndMetadata(spans)

        const evaluation = createEvaluation(target)
        const evaluate = await evaluateFactory({
          columns: [],
          evaluation,
          optimization: baseOptimization,
          document: baseDocument,
          commit: baseCommit,
          workspace: baseWorkspace,
        })

        const result = await evaluate({
          prompt: baseDocument.content,
          example: baseExample,
        })

        expect(result.ok).toBe(true)
        expect(mocks.runEvaluationV2).toHaveBeenCalledTimes(1)
      }
    })
  })
})
