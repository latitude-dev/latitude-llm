import { describe, expect, it } from 'vitest'
import { AssembledSpan, SpanStatus, SpanType } from '@latitude-data/constants'
import { aggregateCompletionEntriesByModel } from './aggregateCompletionSpans'

function completionSpanStub(
  metadata: AssembledSpan<SpanType.Completion>['metadata'],
): AssembledSpan<SpanType.Completion> {
  const now = new Date()
  return {
    id: 'span-id',
    traceId: 'trace-id',
    workspaceId: 1,
    projectId: 1,
    apiKeyId: 1,
    name: 'completion',
    kind: 'internal' as const,
    type: SpanType.Completion,
    status: SpanStatus.Ok,
    duration: 0,
    startedAt: now,
    endedAt: now,
    createdAt: now,
    updatedAt: now,
    depth: 0,
    startOffset: 0,
    endOffset: 0,
    children: [],
    metadata,
  }
}

describe('aggregateCompletionEntriesByModel', () => {
  it('does not mutate shared token objects on the source spans', () => {
    const sharedTokens = {
      prompt: 100,
      cached: 0,
      reasoning: 0,
      completion: 50,
    }

    const spans = [
      completionSpanStub({
        model: 'gpt-test',
        provider: 'openai',
        configuration: {},
        input: [],
        tokens: sharedTokens,
        cost: 1_000,
      }),
      completionSpanStub({
        model: 'gpt-test',
        provider: 'openai',
        configuration: {},
        input: [],
        tokens: sharedTokens,
        cost: 1_000,
      }),
    ]

    const first = aggregateCompletionEntriesByModel(spans)
    const second = aggregateCompletionEntriesByModel(spans)

    expect(sharedTokens).toEqual({
      prompt: 100,
      cached: 0,
      reasoning: 0,
      completion: 50,
    })
    expect(first).toEqual(second)
    expect(first[0]?.tokens).toEqual({
      prompt: 200,
      cached: 0,
      reasoning: 0,
      completion: 100,
    })
  })
})
