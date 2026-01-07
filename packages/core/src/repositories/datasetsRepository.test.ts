import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { database } from '../client'
import { datasets } from '../schema/models/datasets'
import { type Project } from '../schema/models/types/Project'
import { type User } from '../schema/models/types/User'
import { type Workspace } from '../schema/models/types/Workspace'
import * as factories from '../tests/factories'
import { DatasetsRepository } from './datasetsRepository'

describe('DatasetsRepository', () => {
  let workspace: Workspace
  let project: Project
  let user: User
  let datasetsRepository: DatasetsRepository

  beforeEach(async () => {
    const {
      workspace: createdWorkspace,
      project: createdProject,
      user: createdUser,
    } = await factories.createProject()
    workspace = createdWorkspace
    project = createdProject
    user = createdUser
    datasetsRepository = new DatasetsRepository(workspace.id)
  })

  describe('findAllPaginated', () => {
    it('does not return deleted datasets', async () => {
      // Create a dataset
      const { dataset } = await factories.createDataset({
        workspace,
        author: user,
        name: 'dataset-1',
      })

      // Create another dataset that will be deleted
      const { dataset: deletedDataset } = await factories.createDataset({
        workspace,
        author: user,
        name: 'dataset-2',
      })

      // Mark the second dataset as deleted
      await database
        .update(datasets)
        .set({ deletedAt: new Date() })
        .where(eq(datasets.id, deletedDataset.id))

      // Fetch datasets
      const result = await datasetsRepository.findAllPaginated({})

      // Verify only the non-deleted dataset is returned
      expect(result.length).toBe(1)
      expect(result[0]?.id).toBe(dataset.id)
      expect(result.find((d) => d.id === deletedDataset.id)).toBeUndefined()
    })

    it('does not return training and testing datasets', async () => {
      const { commit } = await factories.createDraft({
        project: project,
        user: user,
      })

      // Create a document
      const { documentVersion: document } =
        await factories.createDocumentVersion({
          path: 'prompt',
          content: 'prompt',
          commit: commit,
          user: user,
          workspace: workspace,
        })

      // Create other dataset
      const { dataset } = await factories.createDataset({
        workspace,
        author: user,
      })

      // Create a trainset and a testset
      const { dataset: trainset } = await factories.createDataset({
        workspace,
        author: user,
      })
      const { dataset: testset } = await factories.createDataset({
        workspace,
        author: user,
      })

      // Create an optimization
      await factories.createOptimization({
        baseline: { commit: commit },
        trainset: trainset,
        testset: testset,
        document: document,
        project: project,
        workspace: workspace,
      })

      // Fetch datasets
      const result = await datasetsRepository.findAllPaginated({})

      // Verify only the non-deleted dataset is returned
      expect(result.length).toBe(1)
      expect(result[0]?.id).toBe(dataset.id)
      expect(result.find((d) => d.id === trainset.id)).toBeUndefined()
      expect(result.find((d) => d.id === testset.id)).toBeUndefined()
    })
  })

  describe('findByName', () => {
    it('does not return deleted datasets', async () => {
      // Create a dataset with a unique name
      const datasetName = 'test-dataset-name'
      const { dataset } = await factories.createDataset({
        workspace,
        author: user,
        name: datasetName,
      })

      // Mark the dataset as deleted
      await database
        .update(datasets)
        .set({ deletedAt: new Date() })
        .where(eq(datasets.id, dataset.id))

      // Try to find the deleted dataset by name
      const result = await datasetsRepository.findByName(datasetName)

      // Verify no dataset is returned
      expect(result.length).toBe(0)
    })
  })

  describe('find', () => {
    it('does not return deleted datasets', async () => {
      // Create two datasets
      const { dataset: dataset1 } = await factories.createDataset({
        workspace,
        author: user,
      })

      await database
        .update(datasets)
        .set({ deletedAt: new Date() })
        .where(eq(datasets.id, dataset1.id))

      const result = await datasetsRepository.find(dataset1.id)

      expect(result.error).toBeDefined()
      expect(result.error?.message).toContain('not found')
    })
  })
})
