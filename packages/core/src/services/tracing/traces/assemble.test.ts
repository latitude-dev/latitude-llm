import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SpanType,
  SpanStatus,
  CompletionSpanMetadata,
  AssembledSpan,
} from '../../../constants'
import * as factories from '../../../tests/factories'
import { Workspace } from '../../../schema/models/types/Workspace'
import { assembleTraceStructure, assembleTraceWithMessages } from './assemble'
import { SpanMetadatasRepository } from '../../../repositories'

let workspace: Workspace

describe('assembleTraceStructure', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { workspace: ws } = await factories.createWorkspace()
    workspace = ws
  })

  it('returns error for empty trace', async () => {
    const result = await assembleTraceStructure({
      traceId: 'non-existent-trace',
      workspace,
    })

    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('Cannot assemble an empty trace')
  })

  it('assembles a single span trace', async () => {
    const span = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-1',
      type: SpanType.Prompt,
      name: 'root-span',
      duration: 1000,
    })

    const result = await assembleTraceStructure({
      traceId: span.traceId,
      workspace,
    })

    expect(result.ok).toBe(true)
    expect(result.value?.trace.id).toBe('trace-1')
    expect(result.value?.trace.children).toHaveLength(1)

    const firstSpan = result.value?.trace.children[0]
    expect(firstSpan?.id).toBe(span.id)
    expect(firstSpan?.name).toBe('root-span')
    expect(firstSpan?.depth).toBe(0)
    expect(firstSpan?.metadata).toBeUndefined()
  })

  it('assembles a trace with parent-child relationships', async () => {
    const startTime = new Date()
    const parentSpan = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-2',
      type: SpanType.Prompt,
      name: 'parent',
      startedAt: startTime,
      duration: 2000,
    })

    const childSpan = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-2',
      parentId: parentSpan.id,
      type: SpanType.Completion,
      name: 'child',
      startedAt: new Date(startTime.getTime() + 100),
      duration: 500,
    })

    const result = await assembleTraceStructure({
      traceId: 'trace-2',
      workspace,
    })

    expect(result.ok).toBe(true)
    expect(result.value?.trace.children).toHaveLength(1)

    const parent = result.value?.trace.children[0]
    expect(parent?.id).toBe(parentSpan.id)
    expect(parent?.depth).toBe(0)
    expect(parent?.children).toHaveLength(1)

    const child = parent?.children[0]
    expect(child?.id).toBe(childSpan.id)
    expect(child?.depth).toBe(1)
  })

  it('assembles a trace with multiple root spans', async () => {
    const startTime = new Date()
    const span1 = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-3',
      type: SpanType.Prompt,
      name: 'first',
      startedAt: startTime,
      duration: 1000,
    })

    const span2 = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-3',
      type: SpanType.Prompt,
      name: 'second',
      startedAt: new Date(startTime.getTime() + 2000),
      duration: 1000,
    })

    const result = await assembleTraceStructure({
      traceId: 'trace-3',
      workspace,
    })

    expect(result.ok).toBe(true)
    expect(result.value?.trace.children).toHaveLength(2)
    expect(result.value?.trace.children[0]?.id).toBe(span1.id)
    expect(result.value?.trace.children[1]?.id).toBe(span2.id)
  })

  it('calculates trace duration correctly', async () => {
    const startTime = new Date('2024-01-01T00:00:00.000Z')
    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-4',
      type: SpanType.Prompt,
      startedAt: startTime,
      endedAt: new Date(startTime.getTime() + 3000),
    })

    const result = await assembleTraceStructure({
      traceId: 'trace-4',
      workspace,
    })

    expect(result.ok).toBe(true)
    expect(result.value?.trace.duration).toBe(3000)
    expect(result.value?.trace.startedAt.getTime()).toBe(startTime.getTime())
  })

  it('calculates span offsets correctly', async () => {
    const startTime = new Date('2024-01-01T00:00:00.000Z')
    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-5',
      type: SpanType.Prompt,
      startedAt: new Date(startTime.getTime() + 500),
      endedAt: new Date(startTime.getTime() + 1500),
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-5',
      type: SpanType.Prompt,
      startedAt: startTime,
      endedAt: new Date(startTime.getTime() + 500),
    })

    const result = await assembleTraceStructure({
      traceId: 'trace-5',
      workspace,
    })

    expect(result.ok).toBe(true)
    const spans = result.value?.trace.children ?? []
    expect(spans[0]?.startOffset).toBe(0)
    expect(spans[0]?.endOffset).toBe(500)
    expect(spans[1]?.startOffset).toBe(500)
    expect(spans[1]?.endOffset).toBe(1500)
  })

  it('does not fetch metadata for any spans', async () => {
    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-6',
      type: SpanType.Prompt,
      name: 'parent',
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-6',
      type: SpanType.Completion,
      name: 'completion',
    })

    const result = await assembleTraceStructure({
      traceId: 'trace-6',
      workspace,
    })

    expect(result.ok).toBe(true)
    const allSpans = result.value?.trace.children ?? []
    for (const span of allSpans) {
      expect(span.metadata).toBeUndefined()
      for (const child of span.children ?? []) {
        expect(child.metadata).toBeUndefined()
      }
    }
  })
})

describe('assembleTraceWithMessages', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { workspace: ws } = await factories.createWorkspace()
    workspace = ws
  })

  it('returns trace structure even when no completion span exists', async () => {
    const promptSpan = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-no-completion',
      type: SpanType.Prompt,
      name: 'prompt-only',
    })

    const result = await assembleTraceWithMessages({
      traceId: 'trace-no-completion',
      workspace,
      spanId: promptSpan.id,
    })

    expect(result.ok).toBe(true)
    expect(result.value?.trace.children).toHaveLength(1)
    expect(result.value?.completionSpan).toBeUndefined()
  })

  it('finds and returns the completion span from the trace', async () => {
    const startTime = new Date()
    const promptSpan = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-with-completion',
      type: SpanType.Prompt,
      name: 'prompt',
      startedAt: startTime,
      duration: 2000,
    })

    const completionSpan = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-with-completion',
      parentId: promptSpan.id,
      type: SpanType.Completion,
      name: 'completion',
      startedAt: new Date(startTime.getTime() + 100),
      duration: 1000,
    })

    const result = await assembleTraceWithMessages({
      traceId: 'trace-with-completion',
      workspace,
      spanId: promptSpan.id,
    })

    expect(result.ok).toBe(true)
    expect(result.value?.completionSpan).toBeDefined()
    expect(result.value?.completionSpan?.id).toBe(completionSpan.id)
    expect(result.value?.completionSpan?.type).toBe(SpanType.Completion)
  })

  it('attaches metadata to the completion span in the tree', async () => {
    const mockMetadata = {
      input: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      output: [
        { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
      ],
      provider: 'openai',
      model: 'gpt-4',
      configuration: {},
    } as unknown as CompletionSpanMetadata

    vi.spyOn(SpanMetadatasRepository.prototype, 'getBatch').mockResolvedValue(
      new Map([['trace-with-metadata:completion-span-id', mockMetadata]]),
    )

    const startTime = new Date()
    const promptSpan = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-with-metadata',
      type: SpanType.Prompt,
      name: 'prompt',
      startedAt: startTime,
    })

    const completionSpan = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-with-metadata',
      parentId: promptSpan.id,
      type: SpanType.Completion,
      name: 'completion',
      startedAt: new Date(startTime.getTime() + 100),
    })

    vi.spyOn(SpanMetadatasRepository.prototype, 'getBatch').mockResolvedValue(
      new Map([[`trace-with-metadata:${completionSpan.id}`, mockMetadata]]),
    )

    const result = await assembleTraceWithMessages({
      traceId: 'trace-with-metadata',
      workspace,
      spanId: promptSpan.id,
    })

    expect(result.ok).toBe(true)
    expect(result.value?.completionSpan?.metadata).toBeDefined()
    expect(result.value?.completionSpan?.metadata?.input).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ])
    expect(result.value?.completionSpan?.metadata?.output).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
    ])
  })

  it('attaches metadata to ALL completion spans for proper aggregation', async () => {
    const startTime = new Date()
    const promptSpan = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-multi-completion',
      type: SpanType.Prompt,
      name: 'prompt',
      startedAt: startTime,
      duration: 3000,
    })

    const completion1 = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-multi-completion',
      parentId: promptSpan.id,
      type: SpanType.Completion,
      name: 'completion-1',
      startedAt: new Date(startTime.getTime() + 100),
      duration: 500,
    })

    const completion2 = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-multi-completion',
      parentId: promptSpan.id,
      type: SpanType.Completion,
      name: 'completion-2',
      startedAt: new Date(startTime.getTime() + 700),
      duration: 500,
    })

    const completion3 = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-multi-completion',
      parentId: promptSpan.id,
      type: SpanType.Completion,
      name: 'completion-3',
      startedAt: new Date(startTime.getTime() + 1300),
      duration: 500,
    })

    const mockMetadata1: CompletionSpanMetadata = {
      input: [],
      output: [],
      provider: 'openai',
      model: 'gpt-4',
      configuration: {},
      tokens: { prompt: 100, completion: 50, cached: 0, reasoning: 0 },
      cost: 0.001,
    } as unknown as CompletionSpanMetadata

    const mockMetadata2: CompletionSpanMetadata = {
      input: [],
      output: [],
      provider: 'openai',
      model: 'gpt-4',
      configuration: {},
      tokens: { prompt: 200, completion: 100, cached: 10, reasoning: 0 },
      cost: 0.002,
    } as unknown as CompletionSpanMetadata

    const mockMetadata3: CompletionSpanMetadata = {
      input: [],
      output: [],
      provider: 'openai',
      model: 'gpt-4',
      configuration: {},
      tokens: { prompt: 150, completion: 75, cached: 5, reasoning: 25 },
      cost: 0.0015,
    } as unknown as CompletionSpanMetadata

    vi.spyOn(SpanMetadatasRepository.prototype, 'getBatch').mockResolvedValue(
      new Map([
        [`trace-multi-completion:${completion1.id}`, mockMetadata1],
        [`trace-multi-completion:${completion2.id}`, mockMetadata2],
        [`trace-multi-completion:${completion3.id}`, mockMetadata3],
      ]),
    )

    const result = await assembleTraceWithMessages({
      traceId: 'trace-multi-completion',
      workspace,
      spanId: promptSpan.id,
    })

    expect(result.ok).toBe(true)
    const trace = result.value?.trace
    expect(trace).toBeDefined()

    const rootSpan = trace!.children[0]
    expect(rootSpan?.children).toHaveLength(3)

    const allCompletionSpans = rootSpan!.children
    expect(allCompletionSpans[0]?.metadata).toBeDefined()
    expect(allCompletionSpans[1]?.metadata).toBeDefined()
    expect(allCompletionSpans[2]?.metadata).toBeDefined()

    const meta0 = allCompletionSpans[0]?.metadata as CompletionSpanMetadata
    const meta1 = allCompletionSpans[1]?.metadata as CompletionSpanMetadata
    const meta2 = allCompletionSpans[2]?.metadata as CompletionSpanMetadata

    expect(meta0.tokens?.prompt).toBe(100)
    expect(meta1.tokens?.prompt).toBe(200)
    expect(meta2.tokens?.prompt).toBe(150)

    const totalPromptTokens =
      (meta0.tokens?.prompt ?? 0) +
      (meta1.tokens?.prompt ?? 0) +
      (meta2.tokens?.prompt ?? 0)
    const totalCompletionTokens =
      (meta0.tokens?.completion ?? 0) +
      (meta1.tokens?.completion ?? 0) +
      (meta2.tokens?.completion ?? 0)
    const totalCost =
      (meta0.cost ?? 0) + (meta1.cost ?? 0) + (meta2.cost ?? 0)

    expect(totalPromptTokens).toBe(450)
    expect(totalCompletionTokens).toBe(225)
    expect(totalCost).toBeCloseTo(0.0045)
  })

  it('attaches metadata to nested completion spans across subagents', async () => {
    const startTime = new Date()

    const mainPrompt = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-nested',
      type: SpanType.Prompt,
      name: 'main-prompt',
      startedAt: startTime,
      duration: 5000,
    })

    const mainCompletion = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-nested',
      parentId: mainPrompt.id,
      type: SpanType.Completion,
      name: 'main-completion',
      startedAt: new Date(startTime.getTime() + 100),
      duration: 1000,
    })

    const toolSpan = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-nested',
      parentId: mainPrompt.id,
      type: SpanType.Tool,
      name: 'tool-call',
      startedAt: new Date(startTime.getTime() + 1200),
      duration: 2000,
    })

    const subagentPrompt = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-nested',
      parentId: toolSpan.id,
      type: SpanType.Prompt,
      name: 'subagent-prompt',
      startedAt: new Date(startTime.getTime() + 1300),
      duration: 1500,
    })

    const subagentCompletion = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-nested',
      parentId: subagentPrompt.id,
      type: SpanType.Completion,
      name: 'subagent-completion',
      startedAt: new Date(startTime.getTime() + 1400),
      duration: 800,
    })

    const finalCompletion = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-nested',
      parentId: mainPrompt.id,
      type: SpanType.Completion,
      name: 'final-completion',
      startedAt: new Date(startTime.getTime() + 3500),
      duration: 500,
    })

    const mainMeta: CompletionSpanMetadata = {
      input: [],
      output: [],
      provider: 'openai',
      model: 'gpt-4',
      configuration: {},
      tokens: { prompt: 500, completion: 200, cached: 0, reasoning: 0 },
      cost: 0.01,
    } as unknown as CompletionSpanMetadata

    const subagentMeta: CompletionSpanMetadata = {
      input: [],
      output: [],
      provider: 'anthropic',
      model: 'claude-3',
      configuration: {},
      tokens: { prompt: 300, completion: 150, cached: 50, reasoning: 100 },
      cost: 0.008,
    } as unknown as CompletionSpanMetadata

    const finalMeta: CompletionSpanMetadata = {
      input: [],
      output: [],
      provider: 'openai',
      model: 'gpt-4',
      configuration: {},
      tokens: { prompt: 600, completion: 250, cached: 0, reasoning: 0 },
      cost: 0.012,
    } as unknown as CompletionSpanMetadata

    vi.spyOn(SpanMetadatasRepository.prototype, 'getBatch').mockResolvedValue(
      new Map([
        [`trace-nested:${mainCompletion.id}`, mainMeta],
        [`trace-nested:${subagentCompletion.id}`, subagentMeta],
        [`trace-nested:${finalCompletion.id}`, finalMeta],
      ]),
    )

    const result = await assembleTraceWithMessages({
      traceId: 'trace-nested',
      workspace,
      spanId: mainPrompt.id,
    })

    expect(result.ok).toBe(true)

    function findAllCompletions(spans: AssembledSpan[]): AssembledSpan[] {
      const completions: AssembledSpan[] = []
      for (const span of spans) {
        if (span.type === SpanType.Completion) {
          completions.push(span)
        }
        if (span.children?.length) {
          completions.push(...findAllCompletions(span.children))
        }
      }
      return completions
    }

    const allCompletions = findAllCompletions(result.value!.trace.children)
    expect(allCompletions).toHaveLength(3)

    for (const span of allCompletions) {
      expect(span.metadata).toBeDefined()
      expect((span.metadata as CompletionSpanMetadata).tokens).toBeDefined()
      expect((span.metadata as CompletionSpanMetadata).cost).toBeDefined()
    }

    const totalCost = allCompletions.reduce(
      (sum, span) => sum + ((span.metadata as CompletionSpanMetadata).cost ?? 0),
      0,
    )
    expect(totalCost).toBeCloseTo(0.03)

    const totalPromptTokens = allCompletions.reduce(
      (sum, span) =>
        sum +
        ((span.metadata as CompletionSpanMetadata).tokens?.prompt ?? 0),
      0,
    )
    expect(totalPromptTokens).toBe(1400)
  })
})

describe('assembleTraceStructure - deep nesting', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { workspace: ws } = await factories.createWorkspace()
    workspace = ws
  })

  it('handles deeply nested spans correctly', async () => {
    const startTime = new Date()
    const root = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-deep',
      type: SpanType.Prompt,
      name: 'root',
      startedAt: startTime,
      duration: 5000,
    })

    const level1 = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-deep',
      parentId: root.id,
      type: SpanType.Tool,
      name: 'level1',
      startedAt: new Date(startTime.getTime() + 100),
      duration: 4000,
    })

    const level2 = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-deep',
      parentId: level1.id,
      type: SpanType.Tool,
      name: 'level2',
      startedAt: new Date(startTime.getTime() + 200),
      duration: 3000,
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-deep',
      parentId: level2.id,
      type: SpanType.Completion,
      name: 'level3',
      startedAt: new Date(startTime.getTime() + 300),
      duration: 2000,
    })

    const result = await assembleTraceStructure({
      traceId: 'trace-deep',
      workspace,
    })

    expect(result.ok).toBe(true)
    expect(result.value?.trace.spans).toBe(4)

    const rootSpan = result.value?.trace.children[0]
    expect(rootSpan?.depth).toBe(0)
    expect(rootSpan?.children).toHaveLength(1)

    const l1Span = rootSpan?.children[0]
    expect(l1Span?.depth).toBe(1)
    expect(l1Span?.children).toHaveLength(1)

    const l2Span = l1Span?.children[0]
    expect(l2Span?.depth).toBe(2)
    expect(l2Span?.children).toHaveLength(1)

    const l3Span = l2Span?.children[0]
    expect(l3Span?.depth).toBe(3)
    expect(l3Span?.children).toHaveLength(0)
  })

  it('handles sibling spans at the same level', async () => {
    const startTime = new Date()
    const root = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-siblings',
      type: SpanType.Prompt,
      name: 'root',
      startedAt: startTime,
      duration: 5000,
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-siblings',
      parentId: root.id,
      type: SpanType.Tool,
      name: 'sibling1',
      startedAt: new Date(startTime.getTime() + 100),
      duration: 1000,
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-siblings',
      parentId: root.id,
      type: SpanType.Tool,
      name: 'sibling2',
      startedAt: new Date(startTime.getTime() + 1200),
      duration: 1000,
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-siblings',
      parentId: root.id,
      type: SpanType.Completion,
      name: 'sibling3',
      startedAt: new Date(startTime.getTime() + 2300),
      duration: 1000,
    })

    const result = await assembleTraceStructure({
      traceId: 'trace-siblings',
      workspace,
    })

    expect(result.ok).toBe(true)
    const rootSpan = result.value?.trace.children[0]
    expect(rootSpan?.children).toHaveLength(3)
    expect(rootSpan?.children[0]?.name).toBe('sibling1')
    expect(rootSpan?.children[1]?.name).toBe('sibling2')
    expect(rootSpan?.children[2]?.name).toBe('sibling3')
  })

  it('handles spans with error status', async () => {
    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-error',
      type: SpanType.Prompt,
      name: 'error-span',
      status: SpanStatus.Error,
      message: 'Something went wrong',
    })

    const result = await assembleTraceStructure({
      traceId: 'trace-error',
      workspace,
    })

    expect(result.ok).toBe(true)
    const span = result.value?.trace.children[0]
    expect(span?.status).toBe(SpanStatus.Error)
    expect(span?.message).toBe('Something went wrong')
  })
})
