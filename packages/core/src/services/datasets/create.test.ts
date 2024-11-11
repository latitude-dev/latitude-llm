import { beforeEach, describe, expect, it, vi } from 'vitest'

import { User, Workspace } from '../../browser'
import { publisher } from '../../events/publisher'
import { BadRequestError, Result } from '../../lib'
import { diskFactory } from '../../lib/disk'
import * as syncReadCsv from '../../lib/readCsv'
import * as factories from '../../tests/factories'
import { createDataset } from './create'

describe('createDataset', () => {
  let workspace: Workspace
  let user: User
  let file: File

  const disk = diskFactory()

  beforeEach(async () => {
    const { userData, workspace: w } = await factories.createWorkspace()
    user = userData
    workspace = w

    file = new File(['test-content'], 'test.csv', { type: 'text/csv' })

    vi.spyOn(disk, 'putFile').mockResolvedValue(Result.ok(undefined))
    vi.spyOn(disk, 'file').mockReturnValue({
      // @ts-expect-error - Mock
      toSnapshot: () => Promise.resolve({ size: 100, type: 'text/csv' }),
    })
    // @ts-expect-error - Mock
    vi.spyOn(publisher, 'publishLater').mockImplementation(() => {})
    vi.spyOn(syncReadCsv, 'syncReadCsv').mockResolvedValue(
      // @ts-expect-error - Mock
      Result.ok({
        headers: ['column1', 'column2'],
        rowCount: 10,
      }),
    )
  })

  it('successfully creates a dataset', async () => {
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

    expect(result.error).toBeUndefined()
    expect(result.value).toMatchObject({
      name: 'Test Dataset',
      author: {
        id: user.id,
        name: user.name,
      },
    })
    expect(publisher.publishLater).toHaveBeenCalledWith({
      type: 'datasetCreated',
      data: expect.objectContaining({
        workspaceId: workspace.id,
        userEmail: user.email,
      }),
    })
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

  it('prevents duplicate dataset names', async () => {
    await factories.createDataset({
      workspace,
      name: 'Test Dataset',
      author: user,
    })

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

    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe(
      'A dataset with this name already exists',
    )
  })

  it('slugifies the dataset name for the file key', async () => {
    await createDataset({
      author: user,
      workspace,
      disk,
      data: {
        name: 'Test Dataset With Spaces!',
        file,
        csvDelimiter: ',',
      },
    })

    expect(disk.putFile).toHaveBeenCalledWith(
      expect.stringContaining('test-dataset-with-spaces'),
      expect.any(File),
    )
  })
})
