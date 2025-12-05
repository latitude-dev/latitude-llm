import { env } from '@latitude-data/env'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createIssue } from '../../tests/factories/issues'
import { createProject } from '../../tests/factories/projects'
import { createWorkspace } from '../../tests/factories/workspaces'
import * as weaviate from '../../weaviate'
import { IssueMergedEvent } from '../events'
import { removeMergedIssueVectors } from './removeMergedIssueVectors'

describe('removeMergedIssueVectors', () => {
  const originalWeaviateKey = env.WEAVIATE_API_KEY

  beforeAll(() => {
    ;(env as any).WEAVIATE_API_KEY = 'test-key'
  })

  afterAll(() => {
    ;(env as any).WEAVIATE_API_KEY = originalWeaviateKey
  })

  describe('Weaviate tenant operations', () => {
    it('calls getIssuesCollection with correct tenant name for each merged issue', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, documents } = projectResult
      const document = documents[0]!

      const { issue: issue1 } = await createIssue({
        workspace,
        project,
        document,
      })

      const { issue: issue2 } = await createIssue({
        workspace,
        project,
        document,
      })

      const mockExists = vi.fn().mockResolvedValue(true)
      const mockDeleteById = vi.fn().mockResolvedValue(undefined)
      const mockLength = vi.fn().mockResolvedValue(5)
      const mockRemoveTenant = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          deleteById: mockDeleteById,
        },
        length: mockLength,
        tenants: { remove: mockRemoveTenant },
      }

      const getIssuesCollectionSpy = vi
        .spyOn(weaviate, 'getIssuesCollection')
        .mockResolvedValue(mockCollection as any)

      const event: IssueMergedEvent = {
        type: 'issueMerged',
        data: {
          workspaceId: workspace.id,
          anchorId: 999,
          mergedIds: [issue1.id, issue2.id],
        },
      }

      await removeMergedIssueVectors({ data: event })

      const expectedTenantName1 = weaviate.ISSUES_COLLECTION_TENANT_NAME(
        issue1.workspaceId,
        issue1.projectId,
        issue1.documentUuid,
      )
      const expectedTenantName2 = weaviate.ISSUES_COLLECTION_TENANT_NAME(
        issue2.workspaceId,
        issue2.projectId,
        issue2.documentUuid,
      )

      expect(getIssuesCollectionSpy).toHaveBeenCalledWith({
        tenantName: expectedTenantName1,
      })
      expect(getIssuesCollectionSpy).toHaveBeenCalledWith({
        tenantName: expectedTenantName2,
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
      const { project, documents } = projectResult
      const document = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document,
      })

      const mockExists = vi.fn().mockResolvedValue(true)
      const mockDeleteById = vi.fn().mockResolvedValue(undefined)
      const mockLength = vi.fn().mockResolvedValue(5)
      const mockRemoveTenant = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          deleteById: mockDeleteById,
        },
        length: mockLength,
        tenants: { remove: mockRemoveTenant },
      }

      const getIssuesCollectionSpy = vi
        .spyOn(weaviate, 'getIssuesCollection')
        .mockResolvedValue(mockCollection as any)

      const event: IssueMergedEvent = {
        type: 'issueMerged',
        data: {
          workspaceId: workspace.id,
          anchorId: 999,
          mergedIds: [issue.id],
        },
      }

      await removeMergedIssueVectors({ data: event })

      const expectedTenantName = `${issue.workspaceId}_${issue.projectId}_${issue.documentUuid}`
      expect(getIssuesCollectionSpy).toHaveBeenCalledWith({
        tenantName: expectedTenantName,
      })
    })

    it('removes tenant when collection becomes empty after deletion', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, documents } = projectResult
      const document = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document,
      })

      const mockExists = vi.fn().mockResolvedValue(true)
      const mockDeleteById = vi.fn().mockResolvedValue(undefined)
      const mockLength = vi.fn().mockResolvedValue(0)
      const mockRemoveTenant = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          deleteById: mockDeleteById,
        },
        length: mockLength,
        tenants: { remove: mockRemoveTenant },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const event: IssueMergedEvent = {
        type: 'issueMerged',
        data: {
          workspaceId: workspace.id,
          anchorId: 999,
          mergedIds: [issue.id],
        },
      }

      await removeMergedIssueVectors({ data: event })

      const expectedTenantName = weaviate.ISSUES_COLLECTION_TENANT_NAME(
        issue.workspaceId,
        issue.projectId,
        issue.documentUuid,
      )
      expect(mockRemoveTenant).toHaveBeenCalledWith(expectedTenantName)
    })

    it('does not remove tenant when collection still has items', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, documents } = projectResult
      const document = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document,
      })

      const mockExists = vi.fn().mockResolvedValue(true)
      const mockDeleteById = vi.fn().mockResolvedValue(undefined)
      const mockLength = vi.fn().mockResolvedValue(10)
      const mockRemoveTenant = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          deleteById: mockDeleteById,
        },
        length: mockLength,
        tenants: { remove: mockRemoveTenant },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const event: IssueMergedEvent = {
        type: 'issueMerged',
        data: {
          workspaceId: workspace.id,
          anchorId: 999,
          mergedIds: [issue.id],
        },
      }

      await removeMergedIssueVectors({ data: event })

      expect(mockRemoveTenant).not.toHaveBeenCalled()
    })

    it('deletes vectors by issue uuid', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, documents } = projectResult
      const document = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document,
      })

      const mockExists = vi.fn().mockResolvedValue(true)
      const mockDeleteById = vi.fn().mockResolvedValue(undefined)
      const mockLength = vi.fn().mockResolvedValue(5)
      const mockRemoveTenant = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          deleteById: mockDeleteById,
        },
        length: mockLength,
        tenants: { remove: mockRemoveTenant },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const event: IssueMergedEvent = {
        type: 'issueMerged',
        data: {
          workspaceId: workspace.id,
          anchorId: 999,
          mergedIds: [issue.id],
        },
      }

      await removeMergedIssueVectors({ data: event })

      expect(mockExists).toHaveBeenCalledWith(issue.uuid)
      expect(mockDeleteById).toHaveBeenCalledWith(issue.uuid)
    })

    it('skips deletion when vector does not exist in Weaviate', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, documents } = projectResult
      const document = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document,
      })

      const mockExists = vi.fn().mockResolvedValue(false)
      const mockDeleteById = vi.fn().mockResolvedValue(undefined)
      const mockLength = vi.fn().mockResolvedValue(5)
      const mockRemoveTenant = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          deleteById: mockDeleteById,
        },
        length: mockLength,
        tenants: { remove: mockRemoveTenant },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const event: IssueMergedEvent = {
        type: 'issueMerged',
        data: {
          workspaceId: workspace.id,
          anchorId: 999,
          mergedIds: [issue.id],
        },
      }

      await removeMergedIssueVectors({ data: event })

      expect(mockExists).toHaveBeenCalledWith(issue.uuid)
      expect(mockDeleteById).not.toHaveBeenCalled()
    })

    it('skips Weaviate operations when WEAVIATE_API_KEY is not set', async () => {
      const originalKey = env.WEAVIATE_API_KEY
      ;(env as any).WEAVIATE_API_KEY = undefined

      const { workspace } = await createWorkspace({ features: ['issues'] })

      const getCollectionSpy = vi.spyOn(weaviate, 'getIssuesCollection')

      const event: IssueMergedEvent = {
        type: 'issueMerged',
        data: {
          workspaceId: workspace.id,
          anchorId: 999,
          mergedIds: [1, 2, 3],
        },
      }

      await removeMergedIssueVectors({ data: event })

      expect(getCollectionSpy).not.toHaveBeenCalled()
      ;(env as any).WEAVIATE_API_KEY = originalKey
    })

    it('handles Weaviate errors gracefully without throwing', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, documents } = projectResult
      const document = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document,
      })

      const mockExists = vi
        .fn()
        .mockRejectedValue(new Error('Weaviate connection failed'))

      const mockCollection = {
        data: {
          exists: mockExists,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const event: IssueMergedEvent = {
        type: 'issueMerged',
        data: {
          workspaceId: workspace.id,
          anchorId: 999,
          mergedIds: [issue.id],
        },
      }

      await expect(
        removeMergedIssueVectors({ data: event }),
      ).resolves.not.toThrow()
    })

    it('continues processing remaining issues when one fails', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt': 'This is a test prompt',
        },
      })
      const { project, documents } = projectResult
      const document = documents[0]!

      const { issue: issue1 } = await createIssue({
        workspace,
        project,
        document,
      })

      const { issue: issue2 } = await createIssue({
        workspace,
        project,
        document,
      })

      const mockExists = vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Weaviate error'))
      const mockDeleteById = vi.fn().mockResolvedValue(undefined)
      const mockLength = vi.fn().mockResolvedValue(5)
      const mockRemoveTenant = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          deleteById: mockDeleteById,
        },
        length: mockLength,
        tenants: { remove: mockRemoveTenant },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const event: IssueMergedEvent = {
        type: 'issueMerged',
        data: {
          workspaceId: workspace.id,
          anchorId: 999,
          mergedIds: [issue1.id, issue2.id],
        },
      }

      await expect(
        removeMergedIssueVectors({ data: event }),
      ).resolves.not.toThrow()

      expect(mockDeleteById).toHaveBeenCalledTimes(1)
      expect(mockDeleteById).toHaveBeenCalledWith(issue1.uuid)
    })

    it('processes multiple merged issues from different documents', async () => {
      const { workspace } = await createWorkspace({ features: ['issues'] })
      const projectResult = await createProject({
        workspace,
        documents: {
          'test-prompt-1': 'This is test prompt 1',
          'test-prompt-2': 'This is test prompt 2',
        },
      })
      const { project, documents } = projectResult
      const document1 = documents[0]!
      const document2 = documents[1]!

      const { issue: issue1 } = await createIssue({
        workspace,
        project,
        document: document1,
      })

      const { issue: issue2 } = await createIssue({
        workspace,
        project,
        document: document2,
      })

      const mockExists = vi.fn().mockResolvedValue(true)
      const mockDeleteById = vi.fn().mockResolvedValue(undefined)
      const mockLength = vi.fn().mockResolvedValue(5)
      const mockRemoveTenant = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          deleteById: mockDeleteById,
        },
        length: mockLength,
        tenants: { remove: mockRemoveTenant },
      }

      const getIssuesCollectionSpy = vi
        .spyOn(weaviate, 'getIssuesCollection')
        .mockResolvedValue(mockCollection as any)

      const event: IssueMergedEvent = {
        type: 'issueMerged',
        data: {
          workspaceId: workspace.id,
          anchorId: 999,
          mergedIds: [issue1.id, issue2.id],
        },
      }

      await removeMergedIssueVectors({ data: event })

      const expectedTenantName1 = weaviate.ISSUES_COLLECTION_TENANT_NAME(
        issue1.workspaceId,
        issue1.projectId,
        issue1.documentUuid,
      )
      const expectedTenantName2 = weaviate.ISSUES_COLLECTION_TENANT_NAME(
        issue2.workspaceId,
        issue2.projectId,
        issue2.documentUuid,
      )

      expect(getIssuesCollectionSpy).toHaveBeenCalledWith({
        tenantName: expectedTenantName1,
      })
      expect(getIssuesCollectionSpy).toHaveBeenCalledWith({
        tenantName: expectedTenantName2,
      })

      expect(mockDeleteById).toHaveBeenCalledWith(issue1.uuid)
      expect(mockDeleteById).toHaveBeenCalledWith(issue2.uuid)
    })
  })
})
