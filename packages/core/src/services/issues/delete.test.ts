import { env } from '@latitude-data/env'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createIssue } from '../../tests/factories/issues'
import { createProject } from '../../tests/factories/projects'
import { createWorkspace } from '../../tests/factories/workspaces'
import * as weaviate from '../../weaviate'
import { deleteIssue } from './delete'

describe('deleteIssue', () => {
  const originalWeaviateKey = env.WEAVIATE_API_KEY

  beforeAll(() => {
    ;(env as any).WEAVIATE_API_KEY = 'test-key'
  })

  afterAll(() => {
    ;(env as any).WEAVIATE_API_KEY = originalWeaviateKey
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
      const { project, documents } = projectResult
      const document = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document,
      })

      const mockExists = vi.fn().mockResolvedValue(true)
      const mockDeleteById = vi.fn().mockResolvedValue(undefined)
      const mockLength = vi.fn().mockResolvedValue(1)
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

      await deleteIssue({ issue })

      const expectedTenantName = weaviate.ISSUES_COLLECTION_TENANT_NAME(
        issue.workspaceId,
        issue.projectId,
        issue.documentUuid,
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
      const { project, documents } = projectResult
      const document = documents[0]!

      const { issue } = await createIssue({
        workspace,
        project,
        document,
      })

      const mockExists = vi.fn().mockResolvedValue(true)
      const mockDeleteById = vi.fn().mockResolvedValue(undefined)
      const mockLength = vi.fn().mockResolvedValue(1)
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

      await deleteIssue({ issue })

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

      await deleteIssue({ issue })

      const expectedTenantName = weaviate.ISSUES_COLLECTION_TENANT_NAME(
        issue.workspaceId,
        issue.projectId,
        issue.documentUuid,
      )
      expect(mockRemoveTenant).toHaveBeenCalledWith(expectedTenantName)
    })

    it('does not remove tenant when collection still has items after deletion', async () => {
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

      await deleteIssue({ issue })

      expect(mockRemoveTenant).not.toHaveBeenCalled()
    })

    it('deletes vector by issue uuid', async () => {
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
      const mockLength = vi.fn().mockResolvedValue(1)
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

      await deleteIssue({ issue })

      expect(mockExists).toHaveBeenCalledWith(issue.uuid)
      expect(mockDeleteById).toHaveBeenCalledWith(issue.uuid)
    })

    it('skips deletion if vector does not exist in Weaviate', async () => {
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
      const mockLength = vi.fn().mockResolvedValue(1)
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

      const result = await deleteIssue({ issue })

      expect(result.error).toBeFalsy()
      expect(mockDeleteById).not.toHaveBeenCalled()
    })

    it('skips Weaviate operations when WEAVIATE_API_KEY is not set', async () => {
      const originalKey = env.WEAVIATE_API_KEY
      ;(env as any).WEAVIATE_API_KEY = undefined

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

      const getCollectionSpy = vi.spyOn(weaviate, 'getIssuesCollection')

      const result = await deleteIssue({ issue })

      expect(result.error).toBeFalsy()
      expect(getCollectionSpy).not.toHaveBeenCalled()
      ;(env as any).WEAVIATE_API_KEY = originalKey
    })

    it('returns error when Weaviate operation fails', async () => {
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

      const result = await deleteIssue({ issue })

      expect(result.error).toBeTruthy()
      expect(result.error?.message).toContain('Weaviate connection failed')
    })
  })
})
