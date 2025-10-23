import { describe, expect, it } from 'vitest'
import {
  AssembledSpan,
  SpanType,
  SpanKind,
  SpanStatus,
} from '../../../constants'
import { findSpanById } from './findSpanById'

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

describe('findSpanById', () => {
  it('returns undefined for empty children', () => {
    const result = findSpanById([], 'span-1')
    expect(result).toBeUndefined()
  })

  it('returns undefined for null children', () => {
    const result = findSpanById(null as any, 'span-1')
    expect(result).toBeUndefined()
  })

  it('returns undefined for undefined children', () => {
    const result = findSpanById(undefined as any, 'span-1')
    expect(result).toBeUndefined()
  })

  it('returns undefined for undefined spanId', () => {
    const span = createMockSpan(SpanType.Completion, 'span-1')
    const result = findSpanById([span], undefined)
    expect(result).toBeUndefined()
  })

  it('returns undefined for empty string spanId', () => {
    const span = createMockSpan(SpanType.Completion, 'span-1')
    const result = findSpanById([span], '')
    expect(result).toBeUndefined()
  })

  it('finds span at root level', () => {
    const span = createMockSpan(SpanType.Completion, 'target-span')
    const result = findSpanById([span], 'target-span')

    expect(result).toBe(span)
  })

  it('returns undefined when span id does not match', () => {
    const span = createMockSpan(SpanType.Completion, 'span-1')
    const result = findSpanById([span], 'non-existent')

    expect(result).toBeUndefined()
  })

  it('finds span among multiple root spans', () => {
    const span1 = createMockSpan(SpanType.Completion, 'span-1')
    const span2 = createMockSpan(SpanType.Tool, 'span-2')
    const span3 = createMockSpan(SpanType.Http, 'span-3')

    const result = findSpanById([span1, span2, span3], 'span-2')
    expect(result).toBe(span2)
  })

  it('finds span in nested children', () => {
    const childSpan = createMockSpan(SpanType.Completion, 'child-span')
    const parentSpan = createMockSpan(SpanType.Tool, 'parent-span', [childSpan])

    const result = findSpanById([parentSpan], 'child-span')
    expect(result).toBe(childSpan)
  })

  it('finds span in deeply nested structure', () => {
    const deepSpan = createMockSpan(SpanType.Completion, 'deep-span')
    const level2 = createMockSpan(SpanType.Tool, 'level-2', [deepSpan])
    const level1 = createMockSpan(SpanType.Http, 'level-1', [level2])
    const root = createMockSpan(SpanType.Prompt, 'root', [level1])

    const result = findSpanById([root], 'deep-span')
    expect(result).toBe(deepSpan)
  })

  it('returns first matching span when multiple spans have same id', () => {
    const span1 = createMockSpan(SpanType.Completion, 'duplicate-id')
    const span2 = createMockSpan(SpanType.Tool, 'duplicate-id')

    const result = findSpanById([span1, span2], 'duplicate-id')
    expect(result).toBe(span1)
  })

  it('finds span in complex nested structure', () => {
    const target = createMockSpan(SpanType.Completion, 'target')
    const sibling1 = createMockSpan(SpanType.Tool, 'sibling-1')
    const sibling2 = createMockSpan(SpanType.Http, 'sibling-2')

    const parent1 = createMockSpan(SpanType.Prompt, 'parent-1', [
      sibling1,
      target,
    ])
    const parent2 = createMockSpan(SpanType.Step, 'parent-2', [sibling2])
    const root = createMockSpan(SpanType.Prompt, 'root', [parent1, parent2])

    const result = findSpanById([root], 'target')
    expect(result).toBe(target)
  })

  it('handles empty children arrays in nested structure', () => {
    const emptyParent = createMockSpan(SpanType.Tool, 'empty', [])
    const target = createMockSpan(SpanType.Completion, 'target')
    const root = createMockSpan(SpanType.Prompt, 'root', [emptyParent, target])

    const result = findSpanById([root], 'target')
    expect(result).toBe(target)
  })

  it('searches in breadth-first order', () => {
    const level2Span = createMockSpan(SpanType.Completion, 'level-2')
    const level1Parent = createMockSpan(SpanType.Tool, 'level-1', [level2Span])
    const level1Sibling = createMockSpan(SpanType.Http, 'target')
    const root = createMockSpan(SpanType.Prompt, 'root', [
      level1Parent,
      level1Sibling,
    ])

    const result = findSpanById([root], 'target')
    expect(result).toBe(level1Sibling)
  })

  it('preserves all span properties', () => {
    const span = createMockSpan(SpanType.Completion, 'test-span')
    const result = findSpanById([span], 'test-span')

    expect(result?.id).toBe('test-span')
    expect(result?.type).toBe(SpanType.Completion)
    expect(result?.traceId).toBe('trace-1')
    expect(result?.workspaceId).toBe(1)
  })

  it('works across multiple root nodes', () => {
    const target = createMockSpan(SpanType.Completion, 'target')
    const child1 = createMockSpan(SpanType.Tool, 'child-1')
    const child2 = createMockSpan(SpanType.Http, 'child-2', [target])

    const root1 = createMockSpan(SpanType.Prompt, 'root-1', [child1])
    const root2 = createMockSpan(SpanType.Step, 'root-2', [child2])

    const result = findSpanById([root1, root2], 'target')
    expect(result).toBe(target)
  })

  it('handles special characters in span id', () => {
    const span = createMockSpan(
      SpanType.Completion,
      'span-with-special-chars-@#$%',
    )
    const result = findSpanById([span], 'span-with-special-chars-@#$%')

    expect(result).toBe(span)
  })

  it('is case sensitive', () => {
    const span = createMockSpan(SpanType.Completion, 'SpanId')

    expect(findSpanById([span], 'SpanId')).toBe(span)
    expect(findSpanById([span], 'spanid')).toBeUndefined()
    expect(findSpanById([span], 'SPANID')).toBeUndefined()
  })
})
