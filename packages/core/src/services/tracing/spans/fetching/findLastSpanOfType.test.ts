import { describe, expect, it } from 'vitest'
import {
  AssembledSpan,
  SpanType,
  SpanKind,
  SpanStatus,
} from '../../../../constants'
import { findLastSpanOfType } from './findLastSpanOfType'

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

describe('findLastSpanOfType', () => {
  describe('basic functionality', () => {
    it('returns undefined for empty children', () => {
      const result = findLastSpanOfType({
        children: [],
        spanType: SpanType.Completion,
      })
      expect(result).toBeUndefined()
    })

    it('returns undefined for null children', () => {
      const result = findLastSpanOfType({
        children: null as any,
        spanType: SpanType.Completion,
      })
      expect(result).toBeUndefined()
    })

    it('returns undefined for undefined children', () => {
      const result = findLastSpanOfType({
        children: undefined as any,
        spanType: SpanType.Completion,
      })
      expect(result).toBeUndefined()
    })

    it('finds single span of matching type', () => {
      const completion = createMockSpan(SpanType.Completion, 'span-1')
      const result = findLastSpanOfType({
        children: [completion],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(completion)
    })

    it('returns undefined when no spans match type', () => {
      const tool = createMockSpan(SpanType.Tool, 'span-1')
      const http = createMockSpan(SpanType.Http, 'span-2')

      const result = findLastSpanOfType({
        children: [tool, http],
        spanType: SpanType.Completion,
      })
      expect(result).toBeUndefined()
    })

    it('returns last matching span at root level', () => {
      const completion1 = createMockSpan(SpanType.Completion, 'span-1')
      const completion2 = createMockSpan(SpanType.Completion, 'span-2')
      const tool = createMockSpan(SpanType.Tool, 'span-3')

      const result = findLastSpanOfType({
        children: [completion1, tool, completion2],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(completion2)
    })

    it('preserves span type information', () => {
      const completion = createMockSpan(SpanType.Completion, 'comp-1')
      const result = findLastSpanOfType({
        children: [completion],
        spanType: SpanType.Completion,
      })

      expect(result?.type).toBe(SpanType.Completion)
    })

    it('works with different span types', () => {
      const tool = createMockSpan(SpanType.Tool, 'tool-1')
      const http = createMockSpan(SpanType.Http, 'http-1')
      const embedding = createMockSpan(SpanType.Embedding, 'embedding-1')

      const toolResult = findLastSpanOfType({
        children: [tool, http, embedding],
        spanType: SpanType.Tool,
      })
      const httpResult = findLastSpanOfType({
        children: [tool, http, embedding],
        spanType: SpanType.Http,
      })
      const embeddingResult = findLastSpanOfType({
        children: [tool, http, embedding],
        spanType: SpanType.Embedding,
      })

      expect(toolResult).toBe(tool)
      expect(httpResult).toBe(http)
      expect(embeddingResult).toBe(embedding)
    })
  })

  describe('nested span traversal', () => {
    it('finds span in nested children when not inside main span', () => {
      const childCompletion = createMockSpan(SpanType.Completion, 'child-1')
      const tool = createMockSpan(SpanType.Tool, 'tool-1', [childCompletion])

      const result = findLastSpanOfType({
        children: [tool],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(childCompletion)
    })

    it('searches deeply nested structures', () => {
      const deepestCompletion = createMockSpan(SpanType.Completion, 'deepest')
      const level3 = createMockSpan(SpanType.Tool, 'level-3', [
        deepestCompletion,
      ])
      const level2 = createMockSpan(SpanType.Http, 'level-2', [level3])
      const level1 = createMockSpan(SpanType.Tool, 'level-1', [level2])

      const result = findLastSpanOfType({
        children: [level1],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(deepestCompletion)
    })

    it('handles empty children arrays in nested structures', () => {
      const emptyTool = createMockSpan(SpanType.Tool, 'tool-1', [])
      const completion = createMockSpan(SpanType.Completion, 'comp-1')

      const result = findLastSpanOfType({
        children: [emptyTool, completion],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(completion)
    })

    it('returns last match when multiple matches at same level', () => {
      const comp1 = createMockSpan(SpanType.Completion, 'first')
      const comp2 = createMockSpan(SpanType.Completion, 'second')

      const result = findLastSpanOfType({
        children: [comp1, comp2],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(comp2)
    })

    it('prefers later sibling over nested child in earlier sibling', () => {
      const nestedCompletion = createMockSpan(SpanType.Completion, 'nested')
      const tool = createMockSpan(SpanType.Tool, 'tool', [nestedCompletion])
      const laterCompletion = createMockSpan(SpanType.Completion, 'later')

      const result = findLastSpanOfType({
        children: [tool, laterCompletion],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(laterCompletion)
    })

    it('handles multiple root nodes', () => {
      const comp1 = createMockSpan(SpanType.Completion, 'comp-1')
      const comp2 = createMockSpan(SpanType.Completion, 'comp-2')

      const root1 = createMockSpan(SpanType.Tool, 'root-1', [comp1])
      const root2 = createMockSpan(SpanType.Tool, 'root-2', [comp2])

      const result = findLastSpanOfType({
        children: [root1, root2],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(comp2)
    })
  })

  describe('searchNestedAgents flag', () => {
    it('recurses into prompt spans by default', () => {
      const completion = createMockSpan(SpanType.Completion, 'nested-comp')
      const prompt = createMockSpan(SpanType.Prompt, 'prompt', [completion])

      const result = findLastSpanOfType({
        children: [prompt],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(completion)
    })

    it('recurses into chat spans by default', () => {
      const completion = createMockSpan(SpanType.Completion, 'nested-comp')
      const chat = createMockSpan(SpanType.Chat, 'chat', [completion])

      const result = findLastSpanOfType({
        children: [chat],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(completion)
    })

    it('recurses into external spans by default', () => {
      const completion = createMockSpan(SpanType.Completion, 'nested-comp')
      const external = createMockSpan(SpanType.External, 'external', [
        completion,
      ])

      const result = findLastSpanOfType({
        children: [external],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(completion)
    })

    it('does NOT recurse into main spans when searchNestedAgents is false', () => {
      const completion = createMockSpan(SpanType.Completion, 'nested-comp')
      const prompt = createMockSpan(SpanType.Prompt, 'prompt', [completion])

      const result = findLastSpanOfType({
        children: [prompt],
        spanType: SpanType.Completion,
        searchNestedAgents: false,
      })

      expect(result).toBeUndefined()
    })

    it('stops at main span boundary to respect agent scope', () => {
      const subagentCompletion = createMockSpan(
        SpanType.Completion,
        'subagent-comp',
      )
      const subagentPrompt = createMockSpan(SpanType.Prompt, 'subagent', [
        subagentCompletion,
      ])
      const parentCompletion = createMockSpan(
        SpanType.Completion,
        'parent-comp',
      )

      const result = findLastSpanOfType({
        children: [parentCompletion, subagentPrompt],
        spanType: SpanType.Completion,
        searchNestedAgents: false,
      })

      expect(result).toBe(parentCompletion)
    })

    it('finds completion in nested subagent by default', () => {
      const subagentCompletion = createMockSpan(
        SpanType.Completion,
        'subagent-comp',
      )
      const subagentPrompt = createMockSpan(SpanType.Prompt, 'subagent', [
        subagentCompletion,
      ])
      const parentCompletion = createMockSpan(
        SpanType.Completion,
        'parent-comp',
      )

      const result = findLastSpanOfType({
        children: [parentCompletion, subagentPrompt],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(subagentCompletion)
    })

    it('recurses into non-main spans regardless of flag', () => {
      const completion = createMockSpan(SpanType.Completion, 'nested-comp')
      const tool = createMockSpan(SpanType.Tool, 'tool', [completion])

      const result = findLastSpanOfType({
        children: [tool],
        spanType: SpanType.Completion,
        searchNestedAgents: false,
      })

      expect(result).toBe(completion)
    })

    it('handles deeply nested main spans correctly', () => {
      const deepCompletion = createMockSpan(SpanType.Completion, 'deep-comp')
      const innerPrompt = createMockSpan(SpanType.Prompt, 'inner-prompt', [
        deepCompletion,
      ])
      const tool = createMockSpan(SpanType.Tool, 'tool', [innerPrompt])
      const outerCompletion = createMockSpan(SpanType.Completion, 'outer-comp')

      const resultWithoutNestedSearch = findLastSpanOfType({
        children: [outerCompletion, tool],
        spanType: SpanType.Completion,
        searchNestedAgents: false,
      })

      const resultWithNestedSearch = findLastSpanOfType({
        children: [outerCompletion, tool],
        spanType: SpanType.Completion,
      })

      expect(resultWithoutNestedSearch).toBe(outerCompletion)
      expect(resultWithNestedSearch).toBe(deepCompletion)
    })

    it('can find main spans themselves regardless of flag', () => {
      const prompt = createMockSpan(SpanType.Prompt, 'prompt')
      const tool = createMockSpan(SpanType.Tool, 'tool', [prompt])

      const result = findLastSpanOfType({
        children: [tool],
        spanType: SpanType.Prompt,
        searchNestedAgents: false,
      })

      expect(result).toBe(prompt)
    })

    it('returns first match found, not deepest match', () => {
      const innerPrompt = createMockSpan(SpanType.Prompt, 'inner-prompt')
      const outerPrompt = createMockSpan(SpanType.Prompt, 'outer-prompt', [
        innerPrompt,
      ])
      const tool = createMockSpan(SpanType.Tool, 'tool', [outerPrompt])

      const result = findLastSpanOfType({
        children: [tool],
        spanType: SpanType.Prompt,
      })

      expect(result).toBe(outerPrompt)
    })
  })

  describe('reverse order traversal', () => {
    it('processes children in reverse order', () => {
      const comp1 = createMockSpan(SpanType.Completion, 'comp-1')
      const comp2 = createMockSpan(SpanType.Completion, 'comp-2')
      const comp3 = createMockSpan(SpanType.Completion, 'comp-3')

      const result = findLastSpanOfType({
        children: [comp1, comp2, comp3],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(comp3)
    })

    it('finds last nested match before earlier nested matches', () => {
      const comp1 = createMockSpan(SpanType.Completion, 'comp-1')
      const comp2 = createMockSpan(SpanType.Completion, 'comp-2')

      const tool1 = createMockSpan(SpanType.Tool, 'tool-1', [comp1])
      const tool2 = createMockSpan(SpanType.Tool, 'tool-2', [comp2])

      const result = findLastSpanOfType({
        children: [tool1, tool2],
        spanType: SpanType.Completion,
      })

      expect(result).toBe(comp2)
    })
  })
})
