import { describe, expect, it } from 'vitest'
import {
  AssembledSpan,
  SpanType,
  SpanKind,
  SpanStatus,
} from '../../../constants'
import { findAllSpansOfType } from './findAllSpansOfType'

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

describe('findAllSpansOfType', () => {
  it('returns empty array for empty children', () => {
    const result = findAllSpansOfType([], SpanType.Completion)
    expect(result).toEqual([])
  })

  it('returns empty array for null children', () => {
    const result = findAllSpansOfType(null as any, SpanType.Completion)
    expect(result).toEqual([])
  })

  it('returns empty array for undefined children', () => {
    const result = findAllSpansOfType(undefined as any, SpanType.Completion)
    expect(result).toEqual([])
  })

  it('finds single span of matching type', () => {
    const completion = createMockSpan(SpanType.Completion, 'span-1')
    const result = findAllSpansOfType([completion], SpanType.Completion)

    expect(result).toHaveLength(1)
    expect(result[0]).toBe(completion)
  })

  it('returns empty array when no spans match type', () => {
    const tool = createMockSpan(SpanType.Tool, 'span-1')
    const http = createMockSpan(SpanType.Http, 'span-2')

    const result = findAllSpansOfType([tool, http], SpanType.Completion)
    expect(result).toEqual([])
  })

  it('finds multiple spans of same type at root level', () => {
    const completion1 = createMockSpan(SpanType.Completion, 'span-1')
    const completion2 = createMockSpan(SpanType.Completion, 'span-2')
    const tool = createMockSpan(SpanType.Tool, 'span-3')

    const result = findAllSpansOfType(
      [completion1, tool, completion2],
      SpanType.Completion,
    )

    expect(result).toHaveLength(2)
    expect(result).toContain(completion1)
    expect(result).toContain(completion2)
  })

  it('finds spans in nested children', () => {
    const childCompletion = createMockSpan(SpanType.Completion, 'child-1')
    const tool = createMockSpan(SpanType.Tool, 'tool-1', [childCompletion])

    const result = findAllSpansOfType([tool], SpanType.Completion)

    expect(result).toHaveLength(1)
    expect(result[0]).toBe(childCompletion)
  })

  it('finds spans at multiple depth levels', () => {
    const deepCompletion = createMockSpan(
      SpanType.Completion,
      'deep-completion',
    )
    const midTool = createMockSpan(SpanType.Tool, 'mid-tool', [deepCompletion])
    const rootCompletion = createMockSpan(
      SpanType.Completion,
      'root-completion',
    )
    const rootPrompt = createMockSpan(SpanType.Prompt, 'root-prompt', [
      midTool,
      rootCompletion,
    ])

    const result = findAllSpansOfType([rootPrompt], SpanType.Completion)

    expect(result).toHaveLength(2)
    expect(result).toContain(rootCompletion)
    expect(result).toContain(deepCompletion)
  })

  it('handles complex nested structures', () => {
    const comp1 = createMockSpan(SpanType.Completion, 'comp-1')
    const comp2 = createMockSpan(SpanType.Completion, 'comp-2')
    const comp3 = createMockSpan(SpanType.Completion, 'comp-3')
    const comp4 = createMockSpan(SpanType.Completion, 'comp-4')

    const tool1 = createMockSpan(SpanType.Tool, 'tool-1', [comp1, comp2])
    const http1 = createMockSpan(SpanType.Http, 'http-1', [comp3])
    const prompt1 = createMockSpan(SpanType.Prompt, 'prompt-1', [
      tool1,
      http1,
      comp4,
    ])

    const result = findAllSpansOfType([prompt1], SpanType.Completion)

    expect(result).toHaveLength(4)
    expect(result).toContain(comp1)
    expect(result).toContain(comp2)
    expect(result).toContain(comp3)
    expect(result).toContain(comp4)
  })

  it('handles multiple root nodes with nested children', () => {
    const comp1 = createMockSpan(SpanType.Completion, 'comp-1')
    const comp2 = createMockSpan(SpanType.Completion, 'comp-2')

    const root1 = createMockSpan(SpanType.Prompt, 'root-1', [comp1])
    const root2 = createMockSpan(SpanType.Tool, 'root-2', [comp2])

    const result = findAllSpansOfType([root1, root2], SpanType.Completion)

    expect(result).toHaveLength(2)
    expect(result).toContain(comp1)
    expect(result).toContain(comp2)
  })

  it('does not include parent spans when searching for child type', () => {
    const completion = createMockSpan(SpanType.Completion, 'comp-1')
    const tool = createMockSpan(SpanType.Tool, 'tool-1', [completion])

    const result = findAllSpansOfType([tool], SpanType.Tool)

    expect(result).toHaveLength(1)
    expect(result[0]).toBe(tool)
    expect(result).not.toContain(completion)
  })

  it('preserves span type information', () => {
    const completion = createMockSpan(SpanType.Completion, 'comp-1')
    const result = findAllSpansOfType([completion], SpanType.Completion)

    expect(result[0].type).toBe(SpanType.Completion)
  })

  it('handles empty children arrays in nested structures', () => {
    const emptyTool = createMockSpan(SpanType.Tool, 'tool-1', [])
    const completion = createMockSpan(SpanType.Completion, 'comp-1')
    const prompt = createMockSpan(SpanType.Prompt, 'prompt-1', [
      emptyTool,
      completion,
    ])

    const result = findAllSpansOfType([prompt], SpanType.Completion)

    expect(result).toHaveLength(1)
    expect(result[0]).toBe(completion)
  })

  it('finds all matching types in breadth-first order', () => {
    const comp1 = createMockSpan(SpanType.Completion, 'level-1-comp')
    const comp2 = createMockSpan(SpanType.Completion, 'level-2-comp')
    const comp3 = createMockSpan(SpanType.Completion, 'level-3-comp')

    const tool2 = createMockSpan(SpanType.Tool, 'level-2-tool', [comp3])
    const tool1 = createMockSpan(SpanType.Tool, 'level-1-tool', [comp2, tool2])
    const root = createMockSpan(SpanType.Prompt, 'root', [comp1, tool1])

    const result = findAllSpansOfType([root], SpanType.Completion)

    expect(result).toHaveLength(3)
    expect(result[0]).toBe(comp1)
    expect(result[1]).toBe(comp2)
    expect(result[2]).toBe(comp3)
  })

  it('works with different span types', () => {
    const tool = createMockSpan(SpanType.Tool, 'tool-1')
    const http = createMockSpan(SpanType.Http, 'http-1')
    const embedding = createMockSpan(SpanType.Embedding, 'embedding-1')

    const toolResult = findAllSpansOfType(
      [tool, http, embedding],
      SpanType.Tool,
    )
    const httpResult = findAllSpansOfType(
      [tool, http, embedding],
      SpanType.Http,
    )
    const embeddingResult = findAllSpansOfType(
      [tool, http, embedding],
      SpanType.Embedding,
    )

    expect(toolResult).toHaveLength(1)
    expect(toolResult[0]).toBe(tool)
    expect(httpResult).toHaveLength(1)
    expect(httpResult[0]).toBe(http)
    expect(embeddingResult).toHaveLength(1)
    expect(embeddingResult[0]).toBe(embedding)
  })
})
