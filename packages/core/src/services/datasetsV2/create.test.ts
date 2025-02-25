import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'

import { User, Workspace } from '../../browser'
import { publisher } from '../../events/publisher'
import { BadRequestError, diskFactory, DiskWrapper, Result } from '../../lib'
import * as syncReadCsv from '../../lib/readCsv'
import getTestDisk from '../../tests/testDrive'
import { createTestCsvFile } from '../datasetRows/testHelper'
import * as factories from '../../tests/factories'
import { createDataset } from './create'

// @ts-expect-error - Mock
vi.spyOn(publisher, 'publishLater').mockImplementation(() => {})

describe('createDataset', () => {
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
    const mockHashAlgorithm = vi.fn().mockReturnValue('random-id')
    const result = await createDataset({
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
    expect(mockHashAlgorithm).toHaveBeenNthCalledWith(4, 7)
    expect(result.value?.dataset).toMatchObject({
      name: 'Test Dataset',
      tags: [],
      columns: [
        { identifier: 'random-id', name: 'name' },
        { identifier: 'random-id', name: 'surname' },
        { identifier: 'random-id', name: 'age' },
        { identifier: 'random-id', name: 'nationality' },
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

  it('prevents duplicate dataset names', async () => {
    const { dataset: existingDs } = await factories.createDatasetV2({
      disk,
      workspace,
      author: user,
    })

    const result = await createDataset({
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

  it('handles CSV with no headers', async () => {
    const { file: wrongFile } = await createTestCsvFile({
      fileContent: '1,2',
      name: 'wrong-test-no-headers.csv',
    })

    const result = await createDataset({
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
    const result = await createDataset({
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

      const result = await createDataset({
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

      const result = await createDataset({
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
