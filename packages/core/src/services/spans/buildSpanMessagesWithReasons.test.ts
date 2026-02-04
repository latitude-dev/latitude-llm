import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Result } from '../../lib/Result'
import {
  buildSpanMessagesWithReasons,
  getReasonFromEvaluationResult,
} from './buildSpanMessagesWithReasons'
import * as assembleModule from '../tracing/traces/assemble'
import * as adaptModule from '../tracing/spans/fetching/findCompletionSpanFromTrace'
import * as specificationsModule from '../evaluationsV2/specifications'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { EvaluationResultV2, EvaluationV2 } from '../../constants'

vi.mock('../tracing/traces/assemble', () => ({
  assembleTraceWithMessages: vi.fn(),
}))

vi.mock('../tracing/spans/fetching/findCompletionSpanFromTrace', () => ({
  adaptCompletionSpanMessagesToLegacy: vi.fn(),
}))

vi.mock('../evaluationsV2/specifications', () => ({
  getEvaluationMetricSpecification: vi.fn(),
}))

describe('buildSpanMessagesWithReasons', () => {
  const mockAssembleTraceWithMessages = vi.mocked(
    assembleModule.assembleTraceWithMessages,
  )
  const mockAdaptCompletionSpanMessagesToLegacy = vi.mocked(
    adaptModule.adaptCompletionSpanMessagesToLegacy,
  )

  const mockWorkspace = { id: 1 } as Workspace

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no spans provided', async () => {
    const result = await buildSpanMessagesWithReasons({
      workspace: mockWorkspace,
      spans: [],
      evaluationResults: [],
      evaluations: [],
    })

    expect(Result.isOk(result)).toBe(true)
    expect(result.unwrap()).toEqual([])
    expect(mockAssembleTraceWithMessages).not.toHaveBeenCalled()
  })

  it('builds messages with reasons for each span', async () => {
    const spans = [
      { id: 'span-1', traceId: 'trace-1' },
      { id: 'span-2', traceId: 'trace-2' },
    ]

    const messages1 = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!', toolCalls: [] },
    ]
    const messages2 = [
      { role: 'user', content: 'Goodbye' },
      { role: 'assistant', content: 'Bye!', toolCalls: [] },
    ]

    mockAssembleTraceWithMessages
      .mockResolvedValueOnce(
        Result.ok({
          trace: { messages: [] } as any,
          completionSpan: { metadata: {} } as any,
        }),
      )
      .mockResolvedValueOnce(
        Result.ok({
          trace: { messages: [] } as any,
          completionSpan: { metadata: {} } as any,
        }),
      )

    mockAdaptCompletionSpanMessagesToLegacy
      .mockReturnValueOnce(messages1 as any)
      .mockReturnValueOnce(messages2 as any)

    const result = await buildSpanMessagesWithReasons({
      workspace: mockWorkspace,
      spans,
      evaluationResults: [],
      evaluations: [],
    })

    expect(Result.isOk(result)).toBe(true)
    const messagesWithReasons = result.unwrap()
    expect(messagesWithReasons).toHaveLength(2)
    expect(messagesWithReasons[0]?.messages).toEqual(messages1)
    expect(messagesWithReasons[0]?.reason).toBe('')
    expect(messagesWithReasons[1]?.messages).toEqual(messages2)
    expect(messagesWithReasons[1]?.reason).toBe('')
  })

  it('returns error when assembleTraceWithMessages fails', async () => {
    const spans = [{ id: 'span-1', traceId: 'trace-1' }]

    mockAssembleTraceWithMessages.mockResolvedValueOnce(
      Result.error(new Error('Failed to assemble trace')),
    )

    const result = await buildSpanMessagesWithReasons({
      workspace: mockWorkspace,
      spans,
      evaluationResults: [],
      evaluations: [],
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error?.message).toBe('Failed to assemble trace')
  })

  it('returns error when completionSpan is not found', async () => {
    const spans = [{ id: 'span-1', traceId: 'trace-1' }]

    mockAssembleTraceWithMessages.mockResolvedValueOnce(
      Result.ok({ trace: { messages: [] } as any, completionSpan: undefined }),
    )

    const result = await buildSpanMessagesWithReasons({
      workspace: mockWorkspace,
      spans,
      evaluationResults: [],
      evaluations: [],
    })

    expect(Result.isOk(result)).toBe(false)
    expect(result.error?.message).toBe('Could not find completion span')
  })

  it('matches evaluation results to spans and extracts reasons', async () => {
    const spans = [{ id: 'span-1', traceId: 'trace-1' }]
    const evaluationResults = [
      {
        evaluatedSpanId: 'span-1',
        evaluatedTraceId: 'trace-1',
        evaluationUuid: 'eval-uuid-1',
      },
    ] as EvaluationResultV2[]
    const evaluations = [{ uuid: 'eval-uuid-1' }] as EvaluationV2[]

    const messages = [
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Response', toolCalls: [] },
    ]

    mockAssembleTraceWithMessages.mockResolvedValueOnce(
      Result.ok({
        trace: { messages: [] } as any,
        completionSpan: { metadata: {} } as any,
      }),
    )
    mockAdaptCompletionSpanMessagesToLegacy.mockReturnValueOnce(messages as any)

    vi.mocked(
      specificationsModule.getEvaluationMetricSpecification,
    ).mockReturnValueOnce({
      resultReason: () => 'Test reason',
    } as any)

    const result = await buildSpanMessagesWithReasons({
      workspace: mockWorkspace,
      spans,
      evaluationResults,
      evaluations,
    })

    expect(Result.isOk(result)).toBe(true)
    const messagesWithReasons = result.unwrap()
    expect(messagesWithReasons[0]?.reason).toBe('Test reason')
  })
})

describe('getReasonFromEvaluationResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty string when result is undefined', () => {
    const reason = getReasonFromEvaluationResult(undefined, {} as EvaluationV2)
    expect(reason).toBe('')
  })

  it('returns empty string when evaluation is undefined', () => {
    const reason = getReasonFromEvaluationResult(
      {} as EvaluationResultV2,
      undefined,
    )
    expect(reason).toBe('')
  })

  it('returns empty string when result has error', () => {
    const result = { error: 'Some error' } as unknown as EvaluationResultV2
    const reason = getReasonFromEvaluationResult(result, {} as EvaluationV2)
    expect(reason).toBe('')
  })

  it('returns reason from specification', () => {
    vi.mocked(
      specificationsModule.getEvaluationMetricSpecification,
    ).mockReturnValueOnce({
      resultReason: () => 'Extracted reason',
    } as any)

    const result = {} as EvaluationResultV2
    const evaluation = {} as EvaluationV2

    const reason = getReasonFromEvaluationResult(result, evaluation)
    expect(reason).toBe('Extracted reason')
  })

  it('returns empty string when resultReason returns undefined', () => {
    vi.mocked(
      specificationsModule.getEvaluationMetricSpecification,
    ).mockReturnValueOnce({
      resultReason: () => undefined,
    } as any)

    const result = {} as EvaluationResultV2
    const evaluation = {} as EvaluationV2

    const reason = getReasonFromEvaluationResult(result, evaluation)
    expect(reason).toBe('')
  })
})
