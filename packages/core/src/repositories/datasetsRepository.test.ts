import { beforeEach, describe, expect, it } from 'vitest'

import type { User, Workspace } from '../browser'
import * as factories from '../tests/factories'
import { DatasetsRepository } from './datasetsRepository'
import { database } from '../client'
import { datasets } from '../schema'
import { eq } from 'drizzle-orm'

describe('DatasetsRepository', () => {
  let workspace: Workspace
  let user: User
  let datasetsRepository: DatasetsRepository

  beforeEach(async () => {
    const { workspace: createdWorkspace, user: createdUser } = await factories.createProject()
    workspace = createdWorkspace
    user = createdUser
    datasetsRepository = new DatasetsRepository(workspace.id)
  })

  describe('findAllPaginated', () => {
    it('does not return deleted datasets', async () => {
      // Create a dataset
      const { dataset } = await factories.createDataset({
        workspace,
        author: user,
      })

      // Create another dataset that will be deleted
      const { dataset: deletedDataset } = await factories.createDataset({
        workspace,
        author: user,
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
    it('returns deleted datasets', async () => {
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

      expect(result.error).toBeUndefined()
      expect(result.value?.id).toBe(dataset1.id)
    })
  })
})
