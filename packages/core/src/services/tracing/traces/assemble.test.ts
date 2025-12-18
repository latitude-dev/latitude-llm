import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SpanType,
  SpanStatus,
  CompletionSpanMetadata,
} from '../../../constants'
import * as factories from '../../../tests/factories'
import { Workspace } from '../../../schema/models/types/Workspace'
import { assembleTraceStructure, assembleTraceWithMessages } from './assemble'
import { SpanMetadatasRepository } from '../../../repositories'
import { Result } from '../../../lib/Result'

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
    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-no-completion',
      type: SpanType.Prompt,
      name: 'prompt-only',
    })

    const result = await assembleTraceWithMessages({
      traceId: 'trace-no-completion',
      workspace,
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

    vi.spyOn(SpanMetadatasRepository.prototype, 'get').mockResolvedValue(
      Result.ok(mockMetadata),
    )

    const startTime = new Date()
    const promptSpan = await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-with-metadata',
      type: SpanType.Prompt,
      name: 'prompt',
      startedAt: startTime,
    })

    await factories.createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-with-metadata',
      parentId: promptSpan.id,
      type: SpanType.Completion,
      name: 'completion',
      startedAt: new Date(startTime.getTime() + 100),
    })

    const result = await assembleTraceWithMessages({
      traceId: 'trace-with-metadata',
      workspace,
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
      type: SpanType.Step,
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
