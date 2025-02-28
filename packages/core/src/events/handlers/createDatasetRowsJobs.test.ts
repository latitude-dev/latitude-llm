import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { WebsocketClient } from '../../websockets/workers'
import { createRowsFromUploadedDataset } from '../../services/datasetRows/createRowsFromUploadedDataset'
import { createDatasetRowsJob } from './createDatasetRowsJobs'
import { DatasetV2CreatedEvent } from '../events'

vi.mock('../../services/datasetRows/createRowsFromUploadedDataset', () => ({
  createRowsFromUploadedDataset: vi.fn(),
}))

const FAKE_EVENT = {
  type: 'datasetUploaded' as DatasetV2CreatedEvent['type'],
  data: {
    workspaceId: 1,
    datasetId: 1,
    userEmail: 'paco@merlo.com',
    fileKey: 'file-name-key',
    csvDelimiter: ',',
  },
}

describe('createDatasetRowsJob', () => {
  const websocketsMock = { emit: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-expect-error - not a real implementation
    vi.spyOn(WebsocketClient, 'getSocket').mockResolvedValue(websocketsMock)
  })

  it('should emit datasetRowsCreated with rows on success', async () => {
    const rows = [{ id: 1 }, { id: 2 }] // fake rows

    const mockedCreate = createRowsFromUploadedDataset as Mock
    mockedCreate.mockImplementation(async ({ onRowsCreated }) => {
      onRowsCreated({ rows })
    })

    await createDatasetRowsJob({ data: FAKE_EVENT })

    expect(websocketsMock.emit).toHaveBeenCalledWith('datasetRowsCreated', {
      workspaceId: FAKE_EVENT.data.workspaceId,
      data: {
        datasetId: FAKE_EVENT.data.datasetId,
        rows,
        error: null,
        finished: false,
      },
    })
  })

  it('should emit datasetRowsCreated with error on failure', async () => {
    const error = new Error('something went wrong')

    const mockedCreate = createRowsFromUploadedDataset as Mock
    mockedCreate.mockImplementation(async ({ onError }) => {
      onError(error)
    })

    await createDatasetRowsJob({ data: FAKE_EVENT })

    expect(websocketsMock.emit).toHaveBeenCalledWith('datasetRowsCreated', {
      workspaceId: FAKE_EVENT.data.workspaceId,
      data: {
        datasetId: FAKE_EVENT.data.datasetId,
        rows: null,
        finished: false,
        error,
      },
    })
  })
})
