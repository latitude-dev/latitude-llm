import { env } from '@latitude-data/env'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { SpanType } from '../../constants'
import { createEvaluationResultV2 } from '../../tests/factories/evaluationResultsV2'
import { createEvaluationV2 } from '../../tests/factories/evaluationsV2'
import { createProject } from '../../tests/factories/projects'
import { createSpan } from '../../tests/factories/spans'
import { createWorkspace } from '../../tests/factories/workspaces'
import * as weaviate from '../../weaviate'
import { discoverIssue } from './discover'
import * as sharedModule from './shared'

vi.mock('../../voyage', () => ({
  voyage: vi.fn().mockResolvedValue({
    rerank: vi.fn().mockResolvedValue({
      data: [{ index: 0, relevanceScore: 0.9 }],
    }),
  }),
}))

vi.mock('../../cache', () => ({
  cache: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  }),
}))

describe('discoverIssue', () => {
  const originalCloud = env.LATITUDE_CLOUD
  const originalWeaviateKey = env.WEAVIATE_API_KEY
  const originalVoyageKey = env.VOYAGE_API_KEY

  beforeAll(() => {
    ;(env as any).LATITUDE_CLOUD = true
    ;(env as any).WEAVIATE_API_KEY = 'test-key'
    ;(env as any).VOYAGE_API_KEY = 'test-voyage-key'
  })

  afterAll(() => {
    ;(env as any).LATITUDE_CLOUD = originalCloud
    ;(env as any).WEAVIATE_API_KEY = originalWeaviateKey
    ;(env as any).VOYAGE_API_KEY = originalVoyageKey
  })

  describe('Weaviate tenant operations', () => {
    it('calls getIssuesCollection with correct tenant name built from workspaceId, projectId, and documentUuid', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, commit, documents } = projectResult
      const document = documents[0]!

      const evaluation = await createEvaluationV2({
        document,
        commit,
        workspace,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        hasPassed: false,
      })

      const mockEmbedding = Array(2048).fill(0.1)
      vi.spyOn(sharedModule, 'embedReason').mockResolvedValue({
        ok: true,
        value: mockEmbedding,
        unwrap: () => mockEmbedding,
      } as any)

      const mockHybrid = vi.fn().mockResolvedValue({
        objects: [
          {
            uuid: 'test-issue-uuid',
            properties: {
              title: 'Test Issue',
              description: 'Test Description',
            },
            metadata: { score: 0.95 },
          },
        ],
      })

      const mockCollection = {
        query: {
          hybrid: mockHybrid,
        },
      }

      const getIssuesCollectionSpy = vi
        .spyOn(weaviate, 'getIssuesCollection')
        .mockResolvedValue(mockCollection as any)

      await discoverIssue({
        result: { result, evaluation },
        document,
        project,
      })

      const expectedTenantName = weaviate.ISSUES_COLLECTION_TENANT_NAME(
        project.workspaceId,
        project.id,
        document.documentUuid,
      )
      expect(getIssuesCollectionSpy).toHaveBeenCalledWith({
        tenantName: expectedTenantName,
      })
    })

    it('builds tenant name correctly using ISSUES_COLLECTION_TENANT_NAME format', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, commit, documents } = projectResult
      const document = documents[0]!

      const evaluation = await createEvaluationV2({
        document,
        commit,
        workspace,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        hasPassed: false,
      })

      const mockEmbedding = Array(2048).fill(0.1)
      vi.spyOn(sharedModule, 'embedReason').mockResolvedValue({
        ok: true,
        value: mockEmbedding,
        unwrap: () => mockEmbedding,
      } as any)

      const mockHybrid = vi.fn().mockResolvedValue({
        objects: [],
      })

      const mockCollection = {
        query: {
          hybrid: mockHybrid,
        },
      }

      const getIssuesCollectionSpy = vi
        .spyOn(weaviate, 'getIssuesCollection')
        .mockResolvedValue(mockCollection as any)

      await discoverIssue({
        result: { result, evaluation },
        document,
        project,
      })

      const expectedTenantName = `${project.workspaceId}_${project.id}_${document.documentUuid}`
      expect(getIssuesCollectionSpy).toHaveBeenCalledWith({
        tenantName: expectedTenantName,
      })
    })

    it('uses hybrid search on the issues collection', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, commit, documents } = projectResult
      const document = documents[0]!

      const evaluation = await createEvaluationV2({
        document,
        commit,
        workspace,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        hasPassed: false,
      })

      const mockEmbedding = Array(2048).fill(0.1)
      vi.spyOn(sharedModule, 'embedReason').mockResolvedValue({
        ok: true,
        value: mockEmbedding,
        unwrap: () => mockEmbedding,
      } as any)

      const mockHybrid = vi.fn().mockResolvedValue({
        objects: [],
      })

      const mockCollection = {
        query: {
          hybrid: mockHybrid,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      await discoverIssue({
        result: { result, evaluation },
        document,
        project,
      })

      expect(mockHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          vector: expect.any(Array),
          returnProperties: ['title', 'description'],
          returnMetadata: ['score'],
        }),
      )
    })

    it('returns error when Weaviate operation fails', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, commit, documents } = projectResult
      const document = documents[0]!

      const evaluation = await createEvaluationV2({
        document,
        commit,
        workspace,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        hasPassed: false,
      })

      const mockEmbedding = Array(2048).fill(0.1)
      vi.spyOn(sharedModule, 'embedReason').mockResolvedValue({
        ok: true,
        value: mockEmbedding,
        unwrap: () => mockEmbedding,
      } as any)

      const mockHybrid = vi
        .fn()
        .mockRejectedValue(new Error('Weaviate query failed'))

      const mockCollection = {
        query: {
          hybrid: mockHybrid,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const discovering = await discoverIssue({
        result: { result, evaluation },
        document,
        project,
      })

      expect(discovering.error).toBeTruthy()
      expect(discovering.error?.message).toContain('Weaviate query failed')
    })

    it('returns empty issue when no candidates found', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, commit, documents } = projectResult
      const document = documents[0]!

      const evaluation = await createEvaluationV2({
        document,
        commit,
        workspace,
      })

      const span = await createSpan({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await createEvaluationResultV2({
        evaluation,
        span,
        commit,
        workspace,
        hasPassed: false,
      })

      const mockEmbedding = Array(2048).fill(0.1)
      vi.spyOn(sharedModule, 'embedReason').mockResolvedValue({
        ok: true,
        value: mockEmbedding,
        unwrap: () => mockEmbedding,
      } as any)

      const mockHybrid = vi.fn().mockResolvedValue({
        objects: [],
      })

      const mockCollection = {
        query: {
          hybrid: mockHybrid,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const discovering = await discoverIssue({
        result: { result, evaluation },
        document,
        project,
      })

      expect(discovering.error).toBeFalsy()
      const { embedding, issue } = discovering.unwrap()
      expect(embedding).toBeDefined()
      expect(issue).toBeUndefined()
    })
  })
})
