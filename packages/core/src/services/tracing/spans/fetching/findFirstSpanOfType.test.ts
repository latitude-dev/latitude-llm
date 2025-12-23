import { describe, expect, it } from 'vitest'
import {
  AssembledSpan,
  SpanType,
  SpanKind,
  SpanStatus,
} from '../../../../constants'
import { findFirstSpanOfType } from './findFirstSpanOfType'

function createMockSpan<T extends SpanType>(
  type: T,
  id: string,
  children: AssembledSpan[] = [],
): AssembledSpan<T> {
  return {
    id,
    traceId: 'trace-1',
    parentId: undefined,
    workspaceId: 1,
    apiKeyId: 1,
    name: `${type}-span`,
    kind: SpanKind.Internal,
    type,
    status: SpanStatus.Ok,
    duration: 100,
    startedAt: new Date(),
    endedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    conversationId: undefined,
    children,
    depth: 0,
    startOffset: 0,
    endOffset: 100,
  } as AssembledSpan<T>
}

describe('findFirstSpanOfType', () => {
  it('returns undefined for empty children', () => {
    const result = findFirstSpanOfType([], SpanType.Completion)
    expect(result).toBeUndefined()
  })

  it('returns undefined for null children', () => {
    const result = findFirstSpanOfType(null as any, SpanType.Completion)
    expect(result).toBeUndefined()
  })

  it('returns undefined for undefined children', () => {
    const result = findFirstSpanOfType(undefined as any, SpanType.Completion)
    expect(result).toBeUndefined()
  })

  it('finds single span of matching type', () => {
    const completion = createMockSpan(SpanType.Completion, 'span-1')
    const result = findFirstSpanOfType([completion], SpanType.Completion)

    expect(result).toBe(completion)
  })

  it('returns undefined when no spans match type', () => {
    const tool = createMockSpan(SpanType.Tool, 'span-1')
    const http = createMockSpan(SpanType.Http, 'span-2')

    const result = findFirstSpanOfType([tool, http], SpanType.Completion)
    expect(result).toBeUndefined()
  })

  it('returns first matching span at root level', () => {
    const completion1 = createMockSpan(SpanType.Completion, 'span-1')
    const completion2 = createMockSpan(SpanType.Completion, 'span-2')
    const tool = createMockSpan(SpanType.Tool, 'span-3')

    const result = findFirstSpanOfType(
      [completion1, tool, completion2],
      SpanType.Completion,
    )

    expect(result).toBe(completion1)
  })

  it('processes siblings before descendants', () => {
    const nestedCompletion = createMockSpan(SpanType.Completion, 'nested')
    const tool = createMockSpan(SpanType.Tool, 'tool', [nestedCompletion])
    const siblingCompletion = createMockSpan(SpanType.Completion, 'sibling')

    const result = findFirstSpanOfType(
      [tool, siblingCompletion],
      SpanType.Completion,
    )

    expect(result).toBe(siblingCompletion)
  })

  it('finds span in nested children', () => {
    const childCompletion = createMockSpan(SpanType.Completion, 'child-1')
    const tool = createMockSpan(SpanType.Tool, 'tool-1', [childCompletion])

    const result = findFirstSpanOfType([tool], SpanType.Completion)

    expect(result).toBe(childCompletion)
  })

  it('returns first match in breadth-first order', () => {
    const deepCompletion = createMockSpan(SpanType.Completion, 'deep')
    const midTool = createMockSpan(SpanType.Tool, 'mid', [deepCompletion])
    const shallowCompletion = createMockSpan(SpanType.Completion, 'shallow')
    const rootPrompt = createMockSpan(SpanType.Prompt, 'root', [
      midTool,
      shallowCompletion,
    ])

    const result = findFirstSpanOfType([rootPrompt], SpanType.Completion)

    expect(result).toBe(shallowCompletion)
  })

  it('searches in sibling order before depth', () => {
    const comp1 = createMockSpan(SpanType.Completion, 'comp-1')
    const comp2 = createMockSpan(SpanType.Completion, 'comp-2')

    const tool1 = createMockSpan(SpanType.Tool, 'tool-1', [comp1])
    const tool2 = createMockSpan(SpanType.Tool, 'tool-2', [comp2])
    const root = createMockSpan(SpanType.Prompt, 'root', [tool1, tool2])

    const result = findFirstSpanOfType([root], SpanType.Completion)

    expect(result).toBe(comp1)
  })

  it('handles multiple root nodes', () => {
    const comp1 = createMockSpan(SpanType.Completion, 'comp-1')
    const comp2 = createMockSpan(SpanType.Completion, 'comp-2')

    const root1 = createMockSpan(SpanType.Prompt, 'root-1', [comp1])
    const root2 = createMockSpan(SpanType.Tool, 'root-2', [comp2])

    const result = findFirstSpanOfType([root1, root2], SpanType.Completion)

    expect(result).toBe(comp1)
  })

  it('returns matching root span before checking children', () => {
    const childCompletion = createMockSpan(SpanType.Completion, 'child')
    const rootCompletion = createMockSpan(SpanType.Completion, 'root', [
      childCompletion,
    ])

    const result = findFirstSpanOfType([rootCompletion], SpanType.Completion)

    expect(result).toBe(rootCompletion)
  })

  it('preserves span type information', () => {
    const completion = createMockSpan(SpanType.Completion, 'comp-1')
    const result = findFirstSpanOfType([completion], SpanType.Completion)

    expect(result?.type).toBe(SpanType.Completion)
  })

  it('handles empty children arrays in nested structures', () => {
    const emptyTool = createMockSpan(SpanType.Tool, 'tool-1', [])
    const completion = createMockSpan(SpanType.Completion, 'comp-1')
    const prompt = createMockSpan(SpanType.Prompt, 'prompt-1', [
      emptyTool,
      completion,
    ])

    const result = findFirstSpanOfType([prompt], SpanType.Completion)

    expect(result).toBe(completion)
  })

  it('works with different span types', () => {
    const tool = createMockSpan(SpanType.Tool, 'tool-1')
    const http = createMockSpan(SpanType.Http, 'http-1')
    const embedding = createMockSpan(SpanType.Embedding, 'embedding-1')

    const toolResult = findFirstSpanOfType(
      [tool, http, embedding],
      SpanType.Tool,
    )
    const httpResult = findFirstSpanOfType(
      [tool, http, embedding],
      SpanType.Http,
    )
    const embeddingResult = findFirstSpanOfType(
      [tool, http, embedding],
      SpanType.Embedding,
    )

    expect(toolResult).toBe(tool)
    expect(httpResult).toBe(http)
    expect(embeddingResult).toBe(embedding)
  })

  it('stops searching after finding first match', () => {
    const comp1 = createMockSpan(SpanType.Completion, 'comp-1')
    const comp2 = createMockSpan(SpanType.Completion, 'comp-2')
    const comp3 = createMockSpan(SpanType.Completion, 'comp-3')

    const tool = createMockSpan(SpanType.Tool, 'tool', [comp2, comp3])
    const prompt = createMockSpan(SpanType.Prompt, 'prompt', [comp1, tool])

    const result = findFirstSpanOfType([prompt], SpanType.Completion)

    expect(result).toBe(comp1)
  })

  it('searches deeply nested structures', () => {
    const deepestCompletion = createMockSpan(SpanType.Completion, 'deepest')
    const level3 = createMockSpan(SpanType.Tool, 'level-3', [deepestCompletion])
    const level2 = createMockSpan(SpanType.Http, 'level-2', [level3])
    const level1 = createMockSpan(SpanType.Prompt, 'level-1', [level2])

    const result = findFirstSpanOfType([level1], SpanType.Completion)

    expect(result).toBe(deepestCompletion)
  })

  it('returns first match when multiple matches at same level', () => {
    const comp1 = createMockSpan(SpanType.Completion, 'first')
    const comp2 = createMockSpan(SpanType.Completion, 'second')

    const result = findFirstSpanOfType([comp1, comp2], SpanType.Completion)

    expect(result).toBe(comp1)
  })
})
