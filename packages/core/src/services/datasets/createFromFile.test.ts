import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'

import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { publisher } from '../../events/publisher'
import * as syncReadCsv from '../../lib/readCsv'
import getTestDisk from '../../tests/testDrive'
import { createTestCsvFile } from '../datasetRows/testHelper'
import * as factories from '../../tests/factories'
import { createDatasetFromFile } from './createFromFile'
import { hashAlgorithmArgs } from './utils'
import { BadRequestError } from './../../lib/errors'
import { diskFactory } from './../../lib/disk'
import { DiskWrapper } from './../../lib/disk'
import { Result } from './../../lib/Result'

// @ts-expect-error - Mock
vi.spyOn(publisher, 'publishLater').mockImplementation(() => {})

const mocks = vi.hoisted(() => ({
  nanoid: vi.fn(() => `test-id-${Math.random()}`),
}))
vi.mock('nanoid', () => ({ nanoid: mocks.nanoid }))

describe('createDatasetFromFile', () => {
  let workspace: Workspace
  let user: User
  let file: File
  let disk: DiskWrapper

  beforeEach(async () => {
    const { userData, workspace: w } = await factories.createWorkspace()
    user = userData
    workspace = w
    disk = getTestDisk()
    const { file: testFile } = await createTestCsvFile()
    file = testFile
  })

  afterAll(async () => {
    await disk.deleteAll(`workspaces/${workspace.id}`)
  })

  it('successfully creates a dataset', async () => {
    const mockHashAlgorithm = vi.fn(
      ({ columnName }: hashAlgorithmArgs) => `${columnName}_identifier`,
    )
    const result = await createDatasetFromFile({
      author: user,
      workspace,
      disk,
      hashAlgorithm: mockHashAlgorithm,
      data: {
        name: 'Test Dataset',
        file,
        csvDelimiter: ',',
      },
    })

    expect(result.error).toBeUndefined()
    expect(result.value?.dataset).toMatchObject({
      name: 'Test Dataset',
      tags: [],
      columns: [
        { identifier: 'name_identifier', name: 'name' },
        { identifier: 'surname_identifier', name: 'surname' },
        { identifier: 'age_identifier', name: 'age' },
        { identifier: 'nationality_identifier', name: 'nationality' },
      ],
      author: {
        id: user.id,
        name: user.name,
      },
    })

    expect(publisher.publishLater).toHaveBeenCalledWith({
      type: 'datasetUploaded',
      data: {
        workspaceId: workspace.id,
        datasetId: result.value!.dataset.id,
        fileKey: `workspaces/${workspace.id}/datasets/test-dataset.csv`,
        csvDelimiter: ',',
        userEmail: user.email,
      },
    })
  })

  it('expects nanoid to be called with the correct length', async () => {
    vi.resetModules()
    const mod = await import('./createFromFile')
    const nanoidHashAlgorithm = await import('./utils').then(
      (m) => m.nanoidHashAlgorithm,
    )
    await mod.createDatasetFromFile({
      author: user,
      workspace,
      disk,
      hashAlgorithm: nanoidHashAlgorithm,
      data: {
        name: 'Test Dataset',
        file,
        csvDelimiter: ',',
      },
    })
    expect(mocks.nanoid).toHaveBeenNthCalledWith(4, 7)
  })

  it('prevents duplicate dataset names', async () => {
    const { dataset: existingDs } = await factories.createDataset({
      disk,
      workspace,
      author: user,
    })

    const result = await createDatasetFromFile({
      author: user,
      workspace,
      disk,
      data: {
        name: existingDs.name,
        file,
        csvDelimiter: ',',
      },
    })

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe(
      'A dataset with this name already exists',
    )
  })

  it('allows creating a dataset with the same name as a soft-deleted one', async () => {
    const { destroyDataset } = await import('./destroy')
    const { dataset: existingDs } = await factories.createDataset({
      disk,
      workspace,
      author: user,
      name: 'Soft Deleted Dataset',
    })

    await destroyDataset({ dataset: existingDs })

    const result = await createDatasetFromFile({
      author: user,
      workspace,
      disk,
      data: {
        name: existingDs.name,
        file,
        csvDelimiter: ',',
      },
    })

    expect(result.error).toBeUndefined()
    expect(result.value?.dataset.name).toBe('Soft Deleted Dataset')
  })

  it('handles CSV with no headers', async () => {
    const { file: wrongFile } = await createTestCsvFile({
      fileContent: '1,2',
      name: 'wrong-test-no-headers.csv',
    })

    const result = await createDatasetFromFile({
      author: user,
      workspace,
      disk,
      data: {
        name: 'Test Dataset',
        file: wrongFile,
        csvDelimiter: ',',
      },
    })

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe('CSV file must contain headers')
  })

  it('handles CSV with empty headers', async () => {
    const { file: wrongFile } = await createTestCsvFile({
      fileContent: 'a,,c\n1,2,3',
      name: 'wrong-test-empty-headers.csv',
    })
    const result = await createDatasetFromFile({
      author: user,
      workspace,
      disk,
      data: {
        name: 'Test Dataset',
        file: wrongFile,
        csvDelimiter: ',',
      },
    })

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe('CSV header cannot be an empty string')
  })

  describe('with mocked disk', () => {
    beforeEach(async () => {
      disk = diskFactory()

      file = new File(['test-content'], 'test.csv', { type: 'text/csv' })

      vi.spyOn(disk, 'putFile').mockResolvedValue(Result.ok(undefined))
      vi.spyOn(disk, 'file').mockReturnValue({
        // @ts-expect-error - Mock
        toSnapshot: () => Promise.resolve({ size: 100, type: 'text/csv' }),
      })
      vi.spyOn(syncReadCsv, 'syncReadCsv').mockResolvedValue(
        // @ts-expect-error - Mock
        Result.ok({
          headers: ['column1', 'column2'],
          rowCount: 10,
        }),
      )
    })

    it('handles disk upload errors', async () => {
      vi.spyOn(disk, 'putFile').mockResolvedValue(
        Result.error(new Error('Upload failed')),
      )

      const result = await createDatasetFromFile({
        author: user,
        workspace,
        disk,
        data: {
          name: 'Test Dataset',
          file,
          csvDelimiter: ',',
        },
      })

      // @ts-expect-error - Mock
      expect(result.error.message).toBe('Upload failed')
    })

    it('handles CSV parsing errors', async () => {
      vi.spyOn(syncReadCsv, 'syncReadCsv').mockResolvedValue(
        // @ts-expect-error - Mock
        Result.error(new Error('CSV parsing failed')),
      )

      const result = await createDatasetFromFile({
        author: user,
        workspace,
        disk,
        data: {
          name: 'Test Dataset',
          file,
          csvDelimiter: ',',
        },
      })

      // @ts-expect-error - Mock
      expect(result.error.message).toBe('CSV parsing failed')
    })
  })
})
