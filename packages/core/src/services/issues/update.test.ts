import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { findIssue } from '../../queries/issues/findById'
import { issues } from '../../schema/models/issues'
import { createIssue } from '../../tests/factories/issues'
import { createProject } from '../../tests/factories/projects'
import { createWorkspace } from '../../tests/factories/workspaces'
import * as weaviate from '../../weaviate'
import { updateIssue } from './update'

describe('updateIssue', () => {
  const originalWeaviateKey = env.WEAVIATE_API_KEY

  beforeAll(() => {
    ;(env as any).WEAVIATE_API_KEY = 'test-key'
  })

  afterAll(() => {
    ;(env as any).WEAVIATE_API_KEY = originalWeaviateKey
  })

  describe('updating title and description', () => {
    it('updates issue title and description in database', async () => {
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
        title: 'Original Title',
        description: 'Original Description',
      })

      // Mock Weaviate operations
      const mockExists = vi.fn().mockResolvedValue(true)
      const mockUpdate = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          update: mockUpdate,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const result = await updateIssue({
        issue,
        title: 'Updated Title',
        description: 'Updated Description',
      })

      expect(result.error).toBeFalsy()
      const { issue: updatedIssue } = result.unwrap()

      expect(updatedIssue.title).toBe('Updated Title')
      expect(updatedIssue.description).toBe('Updated Description')

      // Verify database was updated
      const dbIssue = await database
        .select()
        .from(issues)
        .where(eq(issues.id, issue.id))
        .then((r) => r[0]!)

      expect(dbIssue.title).toBe('Updated Title')
      expect(dbIssue.description).toBe('Updated Description')

      // Verify Weaviate was updated with both title and description
      expect(mockUpdate).toHaveBeenCalledWith({
        id: issue.uuid,
        properties: {
          title: 'Updated Title',
          description: 'Updated Description',
        },
      })
    })

    it('fails when only title is provided without description', async () => {
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
        title: 'Original Title',
        description: 'Original Description',
      })

      // Mock Weaviate operations
      const mockExists = vi.fn().mockResolvedValue(true)

      const mockCollection = {
        data: {
          exists: mockExists,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const result = await updateIssue({
        issue,
        title: 'Updated Title Only',
      })

      // Should fail because update requires both title AND description
      expect(result.error).toBeTruthy()
      expect(result.error?.message).toContain(
        'Received update issue operation without vectors',
      )
    })

    it('fails when only description is provided without title', async () => {
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
        title: 'Original Title',
        description: 'Original Description',
      })

      // Mock Weaviate operations
      const mockExists = vi.fn().mockResolvedValue(true)

      const mockCollection = {
        data: {
          exists: mockExists,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const result = await updateIssue({
        issue,
        description: 'Updated Description Only',
      })

      // Should fail because update requires both title AND description
      expect(result.error).toBeTruthy()
      expect(result.error?.message).toContain(
        'Received update issue operation without vectors',
      )
    })
  })

  describe('updating centroid', () => {
    it('updates centroid and vector embeddings in Weaviate', async () => {
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

      // Set initial centroid
      await database
        .update(issues)
        .set({
          centroid: { base: [1, 0], weight: 1 },
        })
        .where(eq(issues.id, issue.id))

      const issueWithCentroid = await database
        .select()
        .from(issues)
        .where(eq(issues.id, issue.id))
        .then((r) => r[0]!)

      // Mock Weaviate operations
      const mockExists = vi.fn().mockResolvedValue(true)
      const mockUpdate = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          update: mockUpdate,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const newCentroid = { base: [0.5, 0.5], weight: 2 }
      const result = await updateIssue({
        issue: issueWithCentroid,
        centroid: newCentroid,
      })

      expect(result.error).toBeFalsy()
      const { issue: updatedIssue } = result.unwrap()

      expect(updatedIssue.centroid).toEqual(newCentroid)

      // Verify Weaviate was updated with normalized embeddings (no properties, only vectors)
      expect(mockUpdate).toHaveBeenCalledWith({
        id: issue.uuid,
        vectors: expect.arrayContaining([
          expect.closeTo(0.707, 2), // normalized value
          expect.closeTo(0.707, 2),
        ]),
      })
    })

    it('does not update vectors in Weaviate when centroid is not provided', async () => {
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

      // Set initial centroid
      await database
        .update(issues)
        .set({
          centroid: { base: [1, 0], weight: 1 },
        })
        .where(eq(issues.id, issue.id))

      const issueWithCentroid = await database
        .select()
        .from(issues)
        .where(eq(issues.id, issue.id))
        .then((r) => r[0]!)

      // Mock Weaviate operations
      const mockExists = vi.fn().mockResolvedValue(true)
      const mockUpdate = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          update: mockUpdate,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const result = await updateIssue({
        issue: issueWithCentroid,
        title: 'Updated Title',
        description: 'Updated Description',
      })

      expect(result.error).toBeFalsy()

      // Verify Weaviate was called with properties but no vectors (preserves existing vectors)
      expect(mockUpdate).toHaveBeenCalledWith({
        id: issue.uuid,
        properties: {
          title: 'Updated Title',
          description: 'Updated Description',
        },
      })
    })
  })

  describe('Weaviate integration', () => {
    it('inserts into Weaviate when issue does not exist', async () => {
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

      // Mock Weaviate operations - issue does not exist
      const mockExists = vi.fn().mockResolvedValue(false)
      const mockInsert = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          insert: mockInsert,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const result = await updateIssue({
        issue,
        title: 'New Title',
        description: 'New Description',
      })

      expect(result.error).toBeFalsy()
      expect(mockInsert).toHaveBeenCalledWith({
        id: issue.uuid,
        properties: { title: 'New Title', description: 'New Description' },
      })
    })

    it('handles Weaviate errors gracefully', async () => {
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

      // Mock Weaviate operations - throw error
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

      const result = await updateIssue({
        issue,
        title: 'Updated Title',
        description: 'Updated Description',
      })

      expect(result.error).toBeTruthy()
      expect(result.error?.message).toContain('Weaviate connection failed')
    })

    it('skips Weaviate operations when WEAVIATE_API_KEY is not set', async () => {
      // Temporarily unset the Weaviate API key
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

      const result = await updateIssue({
        issue,
        title: 'Updated Title',
      })

      expect(result.error).toBeFalsy()
      expect(getCollectionSpy).not.toHaveBeenCalled()

      // Restore the API key
      ;(env as any).WEAVIATE_API_KEY = originalKey
    })
  })

  describe('transaction handling', () => {
    it('publishes issueUpdated event after successful update', async () => {
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

      // Mock Weaviate operations
      const mockExists = vi.fn().mockResolvedValue(true)
      const mockUpdate = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          update: mockUpdate,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const publishSpy = vi.spyOn(publisher, 'publishLater')

      const result = await updateIssue({
        issue,
        title: 'Updated Title',
        description: 'Updated Description',
      })

      expect(result.error).toBeFalsy()

      // Wait for async event publishing
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(publishSpy).toHaveBeenCalledWith({
        type: 'issueUpdated',
        data: {
          workspaceId: workspace.id,
          issueId: issue.id,
        },
      })
    })

    it('updates updatedAt timestamp', async () => {
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

      const originalUpdatedAt = issue.updatedAt

      // Mock Weaviate operations
      const mockExists = vi.fn().mockResolvedValue(true)
      const mockUpdate = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          update: mockUpdate,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      const result = await updateIssue({
        issue,
        title: 'Updated Title',
        description: 'Updated Description',
      })

      expect(result.error).toBeFalsy()
      const { issue: updatedIssue } = result.unwrap()

      expect(updatedIssue.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      )
    })
  })

  describe('repository integration', () => {
    it('issue can be retrieved after update', async () => {
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
        title: 'Original Title',
        description: 'Original Description',
      })

      // Mock Weaviate operations
      const mockExists = vi.fn().mockResolvedValue(true)
      const mockUpdate = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          update: mockUpdate,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      await updateIssue({
        issue,
        title: 'Updated via Service',
        description: 'Updated Description',
      })

      const retrieved = await findIssue({ workspaceId: workspace.id, id: issue.id })

      expect(retrieved.title).toBe('Updated via Service')
    })
  })

  describe('Weaviate tenant name operations', () => {
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
        title: 'Original Title',
        description: 'Original Description',
      })

      const mockExists = vi.fn().mockResolvedValue(true)
      const mockUpdate = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          update: mockUpdate,
        },
      }

      const getIssuesCollectionSpy = vi
        .spyOn(weaviate, 'getIssuesCollection')
        .mockResolvedValue(mockCollection as any)

      await updateIssue({
        issue,
        title: 'Updated Title',
        description: 'Updated Description',
      })

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
        title: 'Original Title',
        description: 'Original Description',
      })

      const mockExists = vi.fn().mockResolvedValue(true)
      const mockUpdate = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          update: mockUpdate,
        },
      }

      const getIssuesCollectionSpy = vi
        .spyOn(weaviate, 'getIssuesCollection')
        .mockResolvedValue(mockCollection as any)

      await updateIssue({
        issue,
        title: 'Updated Title',
        description: 'Updated Description',
      })

      const expectedTenantName = `${issue.workspaceId}_${issue.projectId}_${issue.documentUuid}`
      expect(getIssuesCollectionSpy).toHaveBeenCalledWith({
        tenantName: expectedTenantName,
      })
    })
  })

  describe('edge cases', () => {
    it('handles empty centroid base array', async () => {
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

      // Mock Weaviate operations
      const mockExists = vi.fn().mockResolvedValue(true)
      const mockUpdate = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          update: mockUpdate,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const emptyCentroid = { base: [], weight: 0 }
      const result = await updateIssue({
        issue,
        centroid: emptyCentroid,
      })

      expect(result.error).toBeFalsy()

      // Verify that embedCentroid returns empty array, no properties field
      expect(mockUpdate).toHaveBeenCalledWith({
        id: issue.uuid,
        vectors: [],
      })
    })

    it('handles centroid with zero norm (all zeros)', async () => {
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

      // Mock Weaviate operations
      const mockExists = vi.fn().mockResolvedValue(true)
      const mockUpdate = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          update: mockUpdate,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const zeroCentroid = { base: [0, 0, 0], weight: 0 }
      const result = await updateIssue({
        issue,
        centroid: zeroCentroid,
      })

      expect(result.error).toBeFalsy()

      // embedCentroid should return the zero vector unchanged when norm is 0, no properties field
      expect(mockUpdate).toHaveBeenCalledWith({
        id: issue.uuid,
        vectors: [0, 0, 0],
      })
    })

    it('handles updating all fields simultaneously', async () => {
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
        title: 'Original Title',
        description: 'Original Description',
      })

      // Set initial centroid
      await database
        .update(issues)
        .set({
          centroid: { base: [1, 0], weight: 1 },
        })
        .where(eq(issues.id, issue.id))

      const issueWithCentroid = await database
        .select()
        .from(issues)
        .where(eq(issues.id, issue.id))
        .then((r) => r[0]!)

      // Mock Weaviate operations
      const mockExists = vi.fn().mockResolvedValue(true)
      const mockUpdate = vi.fn().mockResolvedValue(undefined)

      const mockCollection = {
        data: {
          exists: mockExists,
          update: mockUpdate,
        },
      }

      vi.spyOn(weaviate, 'getIssuesCollection').mockResolvedValue(
        mockCollection as any,
      )

      const newCentroid = { base: [0.6, 0.8], weight: 2 }
      const result = await updateIssue({
        issue: issueWithCentroid,
        title: 'All New Title',
        description: 'All New Description',
        centroid: newCentroid,
      })

      expect(result.error).toBeFalsy()
      const { issue: updatedIssue } = result.unwrap()

      expect(updatedIssue.title).toBe('All New Title')
      expect(updatedIssue.description).toBe('All New Description')
      expect(updatedIssue.centroid).toEqual(newCentroid)
    })
  })
})
