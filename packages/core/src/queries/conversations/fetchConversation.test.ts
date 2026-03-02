import { LogSources, SpanType } from '@latitude-data/constants'
import { NotFoundError } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it } from 'vitest'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import type { Commit } from '../../schema/models/types/Commit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Workspace } from '../../schema/models/types/Workspace'
import { createProject, createSpan } from '../../tests/factories'
import { createWorkspace } from '../../tests/factories/workspaces'
import { fetchConversation } from './fetchConversation'

describe('fetchConversation', () => {
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let projectId: number

  beforeEach(async () => {
    const setup = await createProject({
      documents: {
        'test-doc': 'Test content',
      },
    })
    workspace = setup.workspace
    commit = setup.commit
    document = setup.documents[0]!
    projectId = setup.project.id
  })

  describe('basic functionality', () => {
    it('returns a conversation when found', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.documentLogUuid).toBe(documentLogUuid)
    })

    it('returns NotFoundError when conversation does not exist', async () => {
      const nonExistentUuid = generateUUIDIdentifier()

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid: nonExistentUuid,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(NotFoundError)
    })

    it('includes all spans from traces with same documentLogUuid', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Completion,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.traceCount).toBe(2)
      expect(conversation.traceIds).toContain('trace-1')
      expect(conversation.traceIds).toContain('trace-2')
    })
  })

  describe('tenant isolation', () => {
    it('only returns conversation from the correct workspace', async () => {
      const workspace2Setup = await createWorkspace()
      const workspace2 = workspace2Setup.workspace

      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace2.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(NotFoundError)
    })

    it('finds conversation in correct workspace', async () => {
      const workspace2Setup = await createWorkspace()
      const workspace2 = workspace2Setup.workspace

      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace2.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.traceIds).toContain('trace-1')
      expect(conversation.traceIds).not.toContain('trace-2')
    })
  })

  describe('documentUuid filtering', () => {
    it('filters by documentUuid when provided', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const otherDocumentUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: otherDocumentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
        documentUuid: document.documentUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.traceIds).toContain('trace-1')
      expect(conversation.traceIds).not.toContain('trace-2')
    })

    it('returns NotFoundError when documentUuid does not match', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const otherDocumentUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
        documentUuid: otherDocumentUuid,
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(NotFoundError)
    })

    it('returns all spans when documentUuid is not provided', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const otherDocumentUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: otherDocumentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.traceIds).toContain('trace-1')
      expect(conversation.traceIds).toContain('trace-2')
    })
  })

  describe('aggregations', () => {
    it('correctly calculates totalTokens', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        tokensPrompt: 100,
        tokensCached: 50,
        tokensReasoning: 25,
        tokensCompletion: 200,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Completion,
        tokensPrompt: 50,
        tokensCached: 0,
        tokensReasoning: 0,
        tokensCompletion: 100,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.totalTokens).toBe(525)
    })

    it('correctly calculates totalCost', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        cost: 500,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Completion,
        cost: 300,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.totalCost).toBe(800)
    })

    it('correctly calculates totalDuration as wall-clock time per trace', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      const start = new Date('2024-01-01T00:00:00Z')
      const end = new Date('2024-01-01T00:00:03Z')

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: start,
        endedAt: end,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.totalDuration).toBe(3000)
    })

    it('sums per-trace durations instead of using overall time diff', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T10:00:00Z'),
        endedAt: new Date('2024-01-01T10:00:02Z'),
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T15:00:00Z'),
        endedAt: new Date('2024-01-01T15:00:03Z'),
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.totalDuration).toBe(5000)
    })

    it('correctly counts unique traceIds', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Completion,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-3',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.External,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.traceCount).toBe(3)
      expect(conversation.traceIds).toHaveLength(3)
    })

    it('correctly picks the latest source and commitUuid', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const commit2Uuid = generateUUIDIdentifier()

      const oldDate = new Date('2024-01-01')
      const newDate = new Date('2024-06-01')

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        source: LogSources.API,
        startedAt: oldDate,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit2Uuid,
        type: SpanType.Prompt,
        source: LogSources.Playground,
        startedAt: newDate,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.source).toBe(LogSources.Playground)
      expect(conversation.commitUuid).toBe(commit2Uuid)
    })

    it('correctly calculates startedAt and endedAt', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      const now = Date.now()
      const start1 = new Date(now + 3600000)
      const end1 = new Date(now + 7200000)
      const start2 = new Date(now)
      const end2 = new Date(now + 1800000)

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: start1,
        endedAt: end1,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: start2,
        endedAt: end2,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      const resultStartedAt = new Date(conversation.startedAt).getTime()
      const resultEndedAt = new Date(conversation.endedAt).getTime()
      expect(resultStartedAt).toBeLessThan(new Date(start1).getTime())
      expect(resultEndedAt).toBeGreaterThan(new Date(end2).getTime())
    })

    it('handles null token values gracefully', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        tokensPrompt: undefined,
        tokensCached: undefined,
        tokensReasoning: undefined,
        tokensCompletion: undefined,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.totalTokens).toBe(0)
    })

    it('includes experimentUuid from latest span', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      const experimentUuid = generateUUIDIdentifier()

      const oldDate = new Date('2024-01-01')
      const newDate = new Date('2024-06-01')

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        experimentUuid: undefined,
        startedAt: oldDate,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        experimentUuid: experimentUuid,
        startedAt: newDate,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.experimentUuid).toBe(experimentUuid)
    })
  })

  describe('trace expansion', () => {
    it('includes spans from related traces with same documentLogUuid', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        tokensPrompt: 100,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Completion,
        tokensPrompt: 50,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.totalTokens).toBe(150)
    })

    it('does not include spans without documentLogUuid in aggregations', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        tokensPrompt: 100,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: undefined,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Completion,
        tokensPrompt: 50,
      })

      const result = await fetchConversation({
        workspace,
        projectId,
        documentLogUuid,
      })

      expect(result.ok).toBe(true)
      const conversation = result.unwrap()
      expect(conversation.totalTokens).toBe(100)
    })
  })
})
