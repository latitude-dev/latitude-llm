import { LogSources, SpanType } from '@latitude-data/constants'
import { subWeeks } from 'date-fns'
import { beforeEach, describe, expect, it } from 'vitest'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import type { Commit } from '../../schema/models/types/Commit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Workspace } from '../../schema/models/types/Workspace'
import { createProject, createSpan } from '../../tests/factories'
import { createWorkspace } from '../../tests/factories/workspaces'
import {
  fetchConversations,
  type ConversationFilters,
} from './fetchConversations'

describe('fetchConversations', () => {
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion

  beforeEach(async () => {
    const setup = await createProject({
      documents: {
        'test-doc': 'Test content',
      },
    })
    workspace = setup.workspace
    commit = setup.commit
    document = setup.documents[0]!
  })

  describe('basic functionality', () => {
    it('returns empty results when no spans exist', async () => {
      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items, next } = result.unwrap()
      expect(items).toHaveLength(0)
      expect(next).toBeNull()
    })

    it('returns conversations grouped by documentLogUuid', async () => {
      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid2,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items, next } = result.unwrap()
      expect(items).toHaveLength(2)

      const uuids = items.map((i) => i.documentLogUuid)
      expect(uuids).toContain(documentLogUuid1)
      expect(uuids).toContain(documentLogUuid2)
      expect(next).toBeNull()
    })

    it('excludes spans without documentLogUuid', async () => {
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
        traceId: 'trace-2',
        documentLogUuid: undefined,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.documentLogUuid).toBe(documentLogUuid)
    })

    it('only includes main span types (Prompt, Chat, External)', async () => {
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
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Completion,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-3',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Tool,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.traceCount).toBe(1)
    })
  })

  describe('tenant isolation', () => {
    it('only returns spans from the correct workspace', async () => {
      const workspace2Setup = await createWorkspace()
      const workspace2 = workspace2Setup.workspace

      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace2.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid2,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.documentLogUuid).toBe(documentLogUuid1)
    })
  })

  describe('commitUuids filtering', () => {
    it('only returns spans matching commitUuids filter', async () => {
      const commit2Uuid = generateUUIDIdentifier()
      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid2,
        documentUuid: document.documentUuid,
        commitUuid: commit2Uuid,
        type: SpanType.Prompt,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.documentLogUuid).toBe(documentLogUuid1)
    })

    it('returns spans from multiple commit uuids when provided', async () => {
      const commit2Uuid = generateUUIDIdentifier()
      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid2,
        documentUuid: document.documentUuid,
        commitUuid: commit2Uuid,
        type: SpanType.Prompt,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid, commit2Uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(2)
    })
  })

  describe('experimentUuids filtering', () => {
    it('filters by experimentUuids when provided', async () => {
      const experimentUuid = generateUUIDIdentifier()
      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        experimentUuid: experimentUuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid2,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        experimentUuid: undefined,
        type: SpanType.Prompt,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
        experimentUuids: [experimentUuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.documentLogUuid).toBe(documentLogUuid1)
      expect(items[0]!.experimentUuid).toBe(experimentUuid)
    })

    it('returns all spans when experimentUuids is empty array', async () => {
      const experimentUuid = generateUUIDIdentifier()
      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        experimentUuid: experimentUuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid2,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
        experimentUuids: [],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(2)
    })
  })

  describe('createdAt filtering', () => {
    it('filters by createdAt from date only', async () => {
      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()

      const oldDate = new Date('2024-01-01')
      const newDate = new Date('2024-06-01')
      const filterFrom = new Date('2024-03-01')

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: oldDate,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid2,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: newDate,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
        createdAt: { from: filterFrom },
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.documentLogUuid).toBe(documentLogUuid2)
    })

    it('filters by createdAt to date only', async () => {
      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()

      const oldDate = new Date('2024-01-01')
      const newDate = new Date('2024-06-01')
      const filterTo = new Date('2024-03-01')

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: oldDate,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid2,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: newDate,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
        createdAt: { to: filterTo },
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.documentLogUuid).toBe(documentLogUuid1)
    })

    it('filters by createdAt date range (from and to)', async () => {
      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()
      const documentLogUuid3 = generateUUIDIdentifier()

      const date1 = new Date('2024-01-01')
      const date2 = new Date('2024-04-01')
      const date3 = new Date('2024-08-01')

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: date1,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid2,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: date2,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-3',
        documentLogUuid: documentLogUuid3,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: date3,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
        createdAt: { from: new Date('2024-02-01'), to: new Date('2024-06-01') },
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.documentLogUuid).toBe(documentLogUuid2)
    })
  })

  describe('aggregations', () => {
    it('correctly calculates totalTokens from all token fields', async () => {
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
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        tokensPrompt: 50,
        tokensCached: 0,
        tokensReasoning: 0,
        tokensCompletion: 100,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.totalTokens).toBe(525)
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
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        cost: 300,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.totalCost).toBe(800)
    })

    it('correctly calculates totalDuration for main span types only', async () => {
      const documentLogUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        duration: 1000,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Chat,
        duration: 500,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.totalDuration).toBe(1500)
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
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.traceCount).toBe(2)
      expect(items[0]!.traceIds).toHaveLength(2)
      expect(items[0]!.traceIds).toContain('trace-1')
      expect(items[0]!.traceIds).toContain('trace-2')
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

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid, commit2Uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.source).toBe(LogSources.Playground)
      expect(items[0]!.commitUuid).toBe(commit2Uuid)
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

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      const resultStartedAt = new Date(items[0]!.startedAt).getTime()
      const resultEndedAt = new Date(items[0]!.endedAt).getTime()
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

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.totalTokens).toBe(0)
    })
  })

  describe('pagination', () => {
    it('returns correct page of results with limit', async () => {
      for (let i = 0; i < 5; i++) {
        const documentLogUuid = generateUUIDIdentifier()
        await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-${i}`,
          documentLogUuid: documentLogUuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          startedAt: new Date(Date.now() - i * 1000),
        })
      }

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
        limit: 2,
      })

      expect(result.ok).toBe(true)
      const { items, next } = result.unwrap()
      expect(items).toHaveLength(2)
      expect(next).not.toBeNull()
      expect(next!.startedAt).toBeDefined()
      expect(next!.documentLogUuid).toBeDefined()
    })

    it('returns next page correctly using cursor', async () => {
      const uuids: string[] = []

      for (let i = 0; i < 5; i++) {
        const documentLogUuid = generateUUIDIdentifier()
        uuids.push(documentLogUuid)
        await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-${i}`,
          documentLogUuid: documentLogUuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          startedAt: new Date(Date.now() - i * 10000),
        })
      }

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result1 = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
        limit: 2,
      })

      expect(result1.ok).toBe(true)
      const page1 = result1.unwrap()
      expect(page1.items).toHaveLength(2)
      expect(page1.next).not.toBeNull()

      const result2 = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
        from: page1.next!,
        limit: 2,
      })

      expect(result2.ok).toBe(true)
      const page2 = result2.unwrap()
      expect(page2.items).toHaveLength(2)

      const page1Uuids = page1.items.map((i) => i.documentLogUuid)
      const page2Uuids = page2.items.map((i) => i.documentLogUuid)
      const intersection = page1Uuids.filter((u) => page2Uuids.includes(u))
      expect(intersection).toHaveLength(0)
    })

    it('returns null next cursor when no more results', async () => {
      const documentLogUuid = generateUUIDIdentifier()
      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
        limit: 10,
      })

      expect(result.ok).toBe(true)
      const { items, next } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(next).toBeNull()
    })
  })

  describe('ordering', () => {
    it('returns conversations ordered by latest startedAt descending', async () => {
      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()
      const documentLogUuid3 = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01'),
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid2,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-03-01'),
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-3',
        documentLogUuid: documentLogUuid3,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-02-01'),
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(3)
      expect(items[0]!.documentLogUuid).toBe(documentLogUuid2)
      expect(items[1]!.documentLogUuid).toBe(documentLogUuid3)
      expect(items[2]!.documentLogUuid).toBe(documentLogUuid1)
    })
  })

  describe('testDeploymentIds filtering', () => {
    it('filters by testDeploymentIds when provided', async () => {
      const documentLogUuid1 = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
        testDeploymentIds: [999],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(0)
    })
  })

  describe('document filtering', () => {
    it('only returns spans for the specified document', async () => {
      const documentLogUuid1 = generateUUIDIdentifier()
      const documentLogUuid2 = generateUUIDIdentifier()
      const otherDocumentUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-1',
        documentLogUuid: documentLogUuid1,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-2',
        documentLogUuid: documentLogUuid2,
        documentUuid: otherDocumentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.documentLogUuid).toBe(documentLogUuid1)
    })
  })

  describe('default 8-week window and fallback', () => {
    it('returns recent spans within the default 8-week window', async () => {
      const recentUuid = generateUUIDIdentifier()
      const oldUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-recent',
        documentLogUuid: recentUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: subWeeks(new Date(), 1),
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-old',
        documentLogUuid: oldUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: subWeeks(new Date(), 10),
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items, didFallbackToAllTime } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.documentLogUuid).toBe(recentUuid)
      expect(didFallbackToAllTime).toBeUndefined()
    })

    it('falls back to all-time when no spans exist within the default window', async () => {
      const oldUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-old',
        documentLogUuid: oldUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: subWeeks(new Date(), 10),
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items, didFallbackToAllTime } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.documentLogUuid).toBe(oldUuid)
      expect(didFallbackToAllTime).toBe(true)
    })

    it('does not fall back when explicit createdAt is provided', async () => {
      const oldUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-old',
        documentLogUuid: oldUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: subWeeks(new Date(), 10),
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
        createdAt: { from: subWeeks(new Date(), 8) },
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items, didFallbackToAllTime } = result.unwrap()
      expect(items).toHaveLength(0)
      expect(didFallbackToAllTime).toBeUndefined()
    })

    it('does not apply default window for cursor-based pagination', async () => {
      const uuids: string[] = []

      for (let i = 0; i < 3; i++) {
        const uuid = generateUUIDIdentifier()
        uuids.push(uuid)
        await createSpan({
          workspaceId: workspace.id,
          traceId: `trace-${i}`,
          documentLogUuid: uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          startedAt: subWeeks(new Date(), 1 + i),
        })
      }

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result1 = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
        limit: 1,
      })

      expect(result1.ok).toBe(true)
      const page1 = result1.unwrap()
      expect(page1.items).toHaveLength(1)
      expect(page1.next).not.toBeNull()

      const result2 = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
        from: page1.next!,
        limit: 1,
      })

      expect(result2.ok).toBe(true)
      const page2 = result2.unwrap()
      expect(page2.items).toHaveLength(1)
      expect(page2.didFallbackToAllTime).toBeUndefined()
    })

    it('returns empty with didFallbackToAllTime undefined when no spans exist at all', async () => {
      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items, didFallbackToAllTime } = result.unwrap()
      expect(items).toHaveLength(0)
      expect(didFallbackToAllTime).toBe(true)
    })

    it('treats empty createdAt filter as not provided and applies default window', async () => {
      const recentUuid = generateUUIDIdentifier()
      const oldUuid = generateUUIDIdentifier()

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-recent',
        documentLogUuid: recentUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: subWeeks(new Date(), 1),
      })

      await createSpan({
        workspaceId: workspace.id,
        traceId: 'trace-old',
        documentLogUuid: oldUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: subWeeks(new Date(), 10),
      })

      const filters: ConversationFilters = {
        commitUuids: [commit.uuid],
        createdAt: {},
      }

      const result = await fetchConversations({
        workspace,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        filters,
      })

      expect(result.ok).toBe(true)
      const { items, didFallbackToAllTime } = result.unwrap()
      expect(items).toHaveLength(1)
      expect(items[0]!.documentLogUuid).toBe(recentUuid)
      expect(didFallbackToAllTime).toBeUndefined()
    })
  })
})
