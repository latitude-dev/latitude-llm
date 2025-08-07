import { createRowsFromUploadedDataset } from '../../services/datasetRows/createRowsFromUploadedDataset'
import { WebsocketClient } from '../../websockets/workers'
import type { DatasetV2CreatedEvent } from '../events'

export async function createDatasetRowsJob({ data: event }: { data: DatasetV2CreatedEvent }) {
  return await createRowsFromUploadedDataset({
    event,
    onRowsCreated: ({ rows }) => {
      WebsocketClient.sendEvent('datasetRowsCreated', {
        workspaceId: event.data.workspaceId,
        data: {
          datasetId: event.data.datasetId,
          rows,
          finished: false,
          error: null,
        },
      })
    },
    onFinished: () => {
      // TODO: Test this
      WebsocketClient.sendEvent('datasetRowsCreated', {
        workspaceId: event.data.workspaceId,
        data: {
          datasetId: event.data.datasetId,
          finished: true,
          error: null,
          rows: null,
        },
      })
    },
    onError: (error) => {
      WebsocketClient.sendEvent('datasetRowsCreated', {
        workspaceId: event.data.workspaceId,
        data: {
          datasetId: event.data.datasetId,
          rows: null,
          finished: false,
          error,
        },
      })
    },
  })
}
