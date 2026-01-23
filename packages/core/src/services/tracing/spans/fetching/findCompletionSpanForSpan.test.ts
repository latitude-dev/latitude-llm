import { describe, expect, it } from 'vitest'
import {
  AssembledSpan,
  AssembledTrace,
  SpanType,
  SpanKind,
  SpanStatus,
} from '../../../../constants'
import { findCompletionSpanForSpan } from './findCompletionSpanForSpan'

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

function createMockTrace(children: AssembledSpan[]): AssembledTrace {
  return {
    id: 'trace-1',
    children,
    spans: children.length,
    duration: 100,
    startedAt: new Date(),
    endedAt: new Date(),
  }
}

describe('findCompletionSpanForSpan', () => {
  it('returns undefined for undefined span', () => {
    const trace = createMockTrace([])
    const result = findCompletionSpanForSpan(undefined, trace)

    expect(result).toBeUndefined()
  })

  it('returns undefined for undefined trace', () => {
    const span = createMockSpan(SpanType.Prompt, 'span-1')
    const result = findCompletionSpanForSpan(span, undefined)

    expect(result).toBeUndefined()
  })

  it('returns undefined when no main span found', () => {
    const tool = createMockSpan(SpanType.Tool, 'tool-1')
    const http = createMockSpan(SpanType.Http, 'http-1')
    const trace = createMockTrace([tool, http])
    const result = findCompletionSpanForSpan(tool, trace)

    expect(result).toBeUndefined()
  })

  it('finds completion span for a main span with direct completion child', () => {
    const completion = createMockSpan(SpanType.Completion, 'completion-1')
    const prompt = createMockSpan(SpanType.Prompt, 'prompt-1', [completion])
    const trace = createMockTrace([prompt])

    const result = findCompletionSpanForSpan(prompt, trace)

    expect(result).toBe(completion)
    expect(result?.id).toBe('completion-1')
  })

  it('finds the last completion span when multiple completion spans exist', () => {
    const completion1 = createMockSpan(SpanType.Completion, 'completion-1')
    const completion2 = createMockSpan(SpanType.Completion, 'completion-2')
    const prompt = createMockSpan(SpanType.Prompt, 'prompt-1', [
      completion1,
      completion2,
    ])
    const trace = createMockTrace([prompt])

    const result = findCompletionSpanForSpan(prompt, trace)

    expect(result).toBe(completion2)
    expect(result?.id).toBe('completion-2')
  })

  it('finds completion span for a child span within a main span', () => {
    const completion = createMockSpan(SpanType.Completion, 'completion-1')
    const tool = createMockSpan(SpanType.Tool, 'tool-1')
    const prompt = createMockSpan(SpanType.Prompt, 'prompt-1', [
      completion,
      tool,
    ])
    const trace = createMockTrace([prompt])

    // Selecting the tool span should find the parent's completion
    const result = findCompletionSpanForSpan(tool, trace)

    expect(result).toBe(completion)
    expect(result?.id).toBe('completion-1')
  })

  it('stops searching when encountering a child main span', () => {
    // Parent (Prompt) -> Completion -> Tool -> Child (Prompt) -> Completion
    const childCompletion = createMockSpan(
      SpanType.Completion,
      'child-completion',
    )
    const childPrompt = createMockSpan(SpanType.Prompt, 'child-prompt', [
      childCompletion,
    ])
    const tool = createMockSpan(SpanType.Tool, 'tool-1', [childPrompt])
    const parentCompletion = createMockSpan(
      SpanType.Completion,
      'parent-completion',
    )
    const parentPrompt = createMockSpan(SpanType.Prompt, 'parent-prompt', [
      parentCompletion,
      tool,
    ])
    const trace = createMockTrace([parentPrompt])

    // Selecting the parent prompt should find its own completion, not the child's
    const result = findCompletionSpanForSpan(parentPrompt, trace)

    expect(result).toBe(parentCompletion)
    expect(result?.id).toBe('parent-completion')
  })

  it('finds child agent completion when selecting child agent span', () => {
    // Parent (Prompt) -> Completion -> Tool -> Child (Prompt) -> Completion
    const childCompletion = createMockSpan(
      SpanType.Completion,
      'child-completion',
    )
    const childPrompt = createMockSpan(SpanType.Prompt, 'child-prompt', [
      childCompletion,
    ])
    const tool = createMockSpan(SpanType.Tool, 'tool-1', [childPrompt])
    const parentCompletion = createMockSpan(
      SpanType.Completion,
      'parent-completion',
    )
    const parentPrompt = createMockSpan(SpanType.Prompt, 'parent-prompt', [
      parentCompletion,
      tool,
    ])
    const trace = createMockTrace([parentPrompt])

    // Selecting the child prompt should find its own completion
    const result = findCompletionSpanForSpan(childPrompt, trace)

    expect(result).toBe(childCompletion)
    expect(result?.id).toBe('child-completion')
  })

  it('finds child agent completion when selecting a span within child agent', () => {
    // Parent (Prompt) -> Completion -> Tool -> Child (Prompt) -> Completion -> Tool
    const childTool = createMockSpan(SpanType.Tool, 'child-tool')
    const childCompletion = createMockSpan(
      SpanType.Completion,
      'child-completion',
      [childTool],
    )
    const childPrompt = createMockSpan(SpanType.Prompt, 'child-prompt', [
      childCompletion,
    ])
    const parentTool = createMockSpan(SpanType.Tool, 'parent-tool', [
      childPrompt,
    ])
    const parentCompletion = createMockSpan(
      SpanType.Completion,
      'parent-completion',
    )
    const parentPrompt = createMockSpan(SpanType.Prompt, 'parent-prompt', [
      parentCompletion,
      parentTool,
    ])
    const trace = createMockTrace([parentPrompt])

    // Selecting a tool within the child agent should find the child's completion
    const result = findCompletionSpanForSpan(childTool, trace)

    expect(result).toBe(childCompletion)
    expect(result?.id).toBe('child-completion')
  })

  it('handles nested agents: parent -> child1 -> child2', () => {
    // Parent (Prompt) -> Completion -> Tool -> Child1 (Prompt) -> Completion -> Tool -> Child2 (Prompt) -> Completion
    const child2Completion = createMockSpan(
      SpanType.Completion,
      'child2-completion',
    )
    const child2Prompt = createMockSpan(SpanType.Prompt, 'child2-prompt', [
      child2Completion,
    ])
    const child1Tool = createMockSpan(SpanType.Tool, 'child1-tool', [
      child2Prompt,
    ])
    const child1Completion = createMockSpan(
      SpanType.Completion,
      'child1-completion',
      [child1Tool],
    )
    const child1Prompt = createMockSpan(SpanType.Prompt, 'child1-prompt', [
      child1Completion,
    ])
    const parentTool = createMockSpan(SpanType.Tool, 'parent-tool', [
      child1Prompt,
    ])
    const parentCompletion = createMockSpan(
      SpanType.Completion,
      'parent-completion',
    )
    const parentPrompt = createMockSpan(SpanType.Prompt, 'parent-prompt', [
      parentCompletion,
      parentTool,
    ])
    const trace = createMockTrace([parentPrompt])

    // Selecting parent should find parent's completion
    const parentResult = findCompletionSpanForSpan(parentPrompt, trace)
    expect(parentResult?.id).toBe('parent-completion')

    // Selecting child1 should find child1's completion (not child2's)
    const child1Result = findCompletionSpanForSpan(child1Prompt, trace)
    expect(child1Result?.id).toBe('child1-completion')

    // Selecting child2 should find child2's completion
    const child2Result = findCompletionSpanForSpan(child2Prompt, trace)
    expect(child2Result?.id).toBe('child2-completion')
  })

  it('handles multiple child agents with same parent', () => {
    // Parent (Prompt) -> Completion -> Tool1 -> Child1 (Prompt) -> Completion
    //                              -> Tool2 -> Child1 (Prompt) -> Completion -> Tool -> Child2 (Prompt) -> Completion
    const child2Completion = createMockSpan(
      SpanType.Completion,
      'child2-completion',
    )
    const child2Prompt = createMockSpan(SpanType.Prompt, 'child2-prompt', [
      child2Completion,
    ])
    const secondChild1Tool = createMockSpan(SpanType.Tool, 'child1-tool-2', [
      child2Prompt,
    ])
    const secondChild1Completion = createMockSpan(
      SpanType.Completion,
      'child1-completion-2',
      [secondChild1Tool],
    )
    const secondChild1Prompt = createMockSpan(
      SpanType.Prompt,
      'child1-prompt-2',
      [secondChild1Completion],
    )
    const firstChild1Completion = createMockSpan(
      SpanType.Completion,
      'child1-completion-1',
    )
    const firstChild1Prompt = createMockSpan(
      SpanType.Prompt,
      'child1-prompt-1',
      [firstChild1Completion],
    )
    const tool1 = createMockSpan(SpanType.Tool, 'tool-1', [firstChild1Prompt])
    const tool2 = createMockSpan(SpanType.Tool, 'tool-2', [secondChild1Prompt])
    const parentCompletion = createMockSpan(
      SpanType.Completion,
      'parent-completion',
    )
    const parentPrompt = createMockSpan(SpanType.Prompt, 'parent-prompt', [
      parentCompletion,
      tool1,
      tool2,
    ])
    const trace = createMockTrace([parentPrompt])

    // Selecting parent should find parent's completion
    const parentResult = findCompletionSpanForSpan(parentPrompt, trace)
    expect(parentResult?.id).toBe('parent-completion')

    // Selecting first Child1 should find first Child1's completion
    const firstChild1Result = findCompletionSpanForSpan(
      firstChild1Prompt,
      trace,
    )
    expect(firstChild1Result?.id).toBe('child1-completion-1')

    // Selecting second Child1 should find second Child1's completion (not Child2's)
    const secondChild1Result = findCompletionSpanForSpan(
      secondChild1Prompt,
      trace,
    )
    expect(secondChild1Result?.id).toBe('child1-completion-2')

    // Selecting Child2 should find Child2's completion
    const child2Result = findCompletionSpanForSpan(child2Prompt, trace)
    expect(child2Result?.id).toBe('child2-completion')
  })

  it('returns undefined when main span has no completion children', () => {
    const tool = createMockSpan(SpanType.Tool, 'tool-1')
    const prompt = createMockSpan(SpanType.Prompt, 'prompt-1', [tool])
    const trace = createMockTrace([prompt])

    const result = findCompletionSpanForSpan(prompt, trace)

    expect(result).toBeUndefined()
  })

  it('works with External span type as main span', () => {
    const completion = createMockSpan(SpanType.Completion, 'completion-1')
    const external = createMockSpan(SpanType.External, 'external-1', [
      completion,
    ])
    const trace = createMockTrace([external])

    const result = findCompletionSpanForSpan(external, trace)

    expect(result).toBe(completion)
    expect(result?.id).toBe('completion-1')
  })

  it('works with Chat span type as main span', () => {
    const completion = createMockSpan(SpanType.Completion, 'completion-1')
    const chat = createMockSpan(SpanType.Chat, 'chat-1', [completion])
    const trace = createMockTrace([chat])

    const result = findCompletionSpanForSpan(chat, trace)

    expect(result).toBe(completion)
    expect(result?.id).toBe('completion-1')
  })

  it('handles completion span before child main span', () => {
    // Main span has: Completion, then Tool with Child Prompt
    const childCompletion = createMockSpan(
      SpanType.Completion,
      'child-completion',
    )
    const childPrompt = createMockSpan(SpanType.Prompt, 'child-prompt', [
      childCompletion,
    ])
    const tool = createMockSpan(SpanType.Tool, 'tool-1', [childPrompt])
    const parentCompletion = createMockSpan(
      SpanType.Completion,
      'parent-completion',
    )
    const parentPrompt = createMockSpan(SpanType.Prompt, 'parent-prompt', [
      parentCompletion,
      tool,
    ])
    const trace = createMockTrace([parentPrompt])

    const result = findCompletionSpanForSpan(parentPrompt, trace)

    expect(result).toBe(parentCompletion)
    expect(result?.id).toBe('parent-completion')
  })

  it('handles completion span after child main span', () => {
    // Main span has: Tool with Child Prompt, then Completion
    const childCompletion = createMockSpan(
      SpanType.Completion,
      'child-completion',
    )
    const childPrompt = createMockSpan(SpanType.Prompt, 'child-prompt', [
      childCompletion,
    ])
    const tool = createMockSpan(SpanType.Tool, 'tool-1', [childPrompt])
    const parentCompletion = createMockSpan(
      SpanType.Completion,
      'parent-completion',
    )
    const parentPrompt = createMockSpan(SpanType.Prompt, 'parent-prompt', [
      tool,
      parentCompletion,
    ])
    const trace = createMockTrace([parentPrompt])

    // The completion span is a sibling of the tool (not nested inside it),
    // so it should be found even though it comes after the child main span
    const result = findCompletionSpanForSpan(parentPrompt, trace)

    expect(result).toBe(parentCompletion)
    expect(result?.id).toBe('parent-completion')
  })

  it('handles multiple completion spans before child main span', () => {
    const childCompletion = createMockSpan(
      SpanType.Completion,
      'child-completion',
    )
    const childPrompt = createMockSpan(SpanType.Prompt, 'child-prompt', [
      childCompletion,
    ])
    const tool = createMockSpan(SpanType.Tool, 'tool-1', [childPrompt])
    const completion1 = createMockSpan(SpanType.Completion, 'completion-1')
    const completion2 = createMockSpan(SpanType.Completion, 'completion-2')
    const parentPrompt = createMockSpan(SpanType.Prompt, 'parent-prompt', [
      completion1,
      completion2,
      tool,
    ])
    const trace = createMockTrace([parentPrompt])

    const result = findCompletionSpanForSpan(parentPrompt, trace)

    // Should find the last completion before the child main span
    expect(result).toBe(completion2)
    expect(result?.id).toBe('completion-2')
  })
})
