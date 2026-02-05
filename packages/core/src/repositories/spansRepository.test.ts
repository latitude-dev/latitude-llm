import { beforeEach, describe, expect, it } from 'vitest'
import { SpansRepository } from './spansRepository'
import { Providers, SpanType } from '@latitude-data/constants'
import * as factories from '../tests/factories'
import { Commit } from '../schema/models/types/Commit'
import { DocumentVersion } from '../schema/models/types/DocumentVersion'
import { WorkspaceDto } from '../schema/models/types/Workspace'
import { ApiKey } from '../schema/models/types/ApiKey'
import { faker } from '@faker-js/faker'

describe('SpansRepository', () => {
  let workspace: WorkspaceDto
  let commit: Commit
  let document: DocumentVersion
  let apiKey: ApiKey

  beforeEach(async () => {
    const projectData = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Test prompt content',
        }),
      },
    })
    workspace = projectData.workspace as WorkspaceDto
    commit = projectData.commit
    document = projectData.documents[0]!

    const apiKeyData = await factories.createApiKey({
      workspace,
      name: 'test-api-key',
    })
    apiKey = apiKeyData.apiKey
  })

  describe('findFirstMainSpanByDocumentLogUuid', () => {
    it('should return the first main span by startedAt', async () => {
      const documentLogUuid = faker.string.uuid()

      await factories.createSpan({
        id: 'span-2',
        traceId: 'trace-2',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:01:00Z'),
      })

      await factories.createSpan({
        id: 'span-1',
        traceId: 'trace-1',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:00:00Z'),
      })

      await factories.createSpan({
        id: 'span-3',
        traceId: 'trace-3',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:02:00Z'),
      })

      const repo = new SpansRepository(workspace.id)
      const firstSpan =
        await repo.findFirstMainSpanByDocumentLogUuid(documentLogUuid)

      expect(firstSpan).toBeDefined()
      expect(firstSpan?.id).toBe('span-1')
      expect(firstSpan?.traceId).toBe('trace-1')
    })

    it('should only consider main span types (Prompt, Chat, External)', async () => {
      const documentLogUuid = faker.string.uuid()

      await factories.createSpan({
        id: 'span-tool',
        traceId: 'trace-tool',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Tool,
        startedAt: new Date('2024-01-01T00:00:00Z'),
      })

      await factories.createSpan({
        id: 'span-prompt',
        traceId: 'trace-prompt',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:01:00Z'),
      })

      const repo = new SpansRepository(workspace.id)
      const firstSpan =
        await repo.findFirstMainSpanByDocumentLogUuid(documentLogUuid)

      expect(firstSpan).toBeDefined()
      expect(firstSpan?.id).toBe('span-prompt')
    })

    it('should return undefined for non-existent documentLogUuid', async () => {
      const repo = new SpansRepository(workspace.id)
      const firstSpan = await repo.findFirstMainSpanByDocumentLogUuid(
        faker.string.uuid(),
      )

      expect(firstSpan).toBeUndefined()
    })
  })

  describe('isFirstMainSpanInConversation', () => {
    it('should return true for the first main span', async () => {
      const documentLogUuid = faker.string.uuid()

      await factories.createSpan({
        id: 'first-span',
        traceId: 'first-trace',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:00:00Z'),
      })

      await factories.createSpan({
        id: 'second-span',
        traceId: 'second-trace',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:01:00Z'),
      })

      const repo = new SpansRepository(workspace.id)
      const isFirst = await repo.isFirstMainSpanInConversation(
        documentLogUuid,
        'first-span',
        'first-trace',
      )

      expect(isFirst).toBe(true)
    })

    it('should return false for non-first spans', async () => {
      const documentLogUuid = faker.string.uuid()

      await factories.createSpan({
        id: 'first-span',
        traceId: 'first-trace',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:00:00Z'),
      })

      await factories.createSpan({
        id: 'second-span',
        traceId: 'second-trace',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:01:00Z'),
      })

      const repo = new SpansRepository(workspace.id)
      const isFirst = await repo.isFirstMainSpanInConversation(
        documentLogUuid,
        'second-span',
        'second-trace',
      )

      expect(isFirst).toBe(false)
    })

    it('should return false for non-existent span', async () => {
      const documentLogUuid = faker.string.uuid()

      await factories.createSpan({
        id: 'existing-span',
        traceId: 'existing-trace',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:00:00Z'),
      })

      const repo = new SpansRepository(workspace.id)
      const isFirst = await repo.isFirstMainSpanInConversation(
        documentLogUuid,
        'non-existent-span',
        'non-existent-trace',
      )

      expect(isFirst).toBe(false)
    })

    it('should return false when documentLogUuid has no spans', async () => {
      const repo = new SpansRepository(workspace.id)
      const isFirst = await repo.isFirstMainSpanInConversation(
        faker.string.uuid(),
        'any-span',
        'any-trace',
      )

      expect(isFirst).toBe(false)
    })
  })

  describe('findLastMainSpanByDocumentLogUuid', () => {
    it('should return the last main span by startedAt', async () => {
      const documentLogUuid = faker.string.uuid()

      await factories.createSpan({
        id: 'span-1',
        traceId: 'trace-1',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:00:00Z'),
      })

      await factories.createSpan({
        id: 'span-3',
        traceId: 'trace-3',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:02:00Z'),
      })

      await factories.createSpan({
        id: 'span-2',
        traceId: 'trace-2',
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        documentLogUuid,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
        startedAt: new Date('2024-01-01T00:01:00Z'),
      })

      const repo = new SpansRepository(workspace.id)
      const lastSpan =
        await repo.findLastMainSpanByDocumentLogUuid(documentLogUuid)

      expect(lastSpan).toBeDefined()
      expect(lastSpan?.id).toBe('span-3')
      expect(lastSpan?.traceId).toBe('trace-3')
    })
  })
})
