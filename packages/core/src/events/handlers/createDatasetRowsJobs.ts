import { createRowsFromUploadedDataset } from '../../services/datasetRows/createRowsFromUploadedDataset'
import { WebsocketClient } from '../../websockets/workers'
import { DatasetV2CreatedEvent } from '../events'

export async function createDatasetRowsJob({
  data: event,
}: {
  data: DatasetV2CreatedEvent
}) {
  const websockets = await WebsocketClient.getSocket()
  return await createRowsFromUploadedDataset({
    event,
    onRowsCreated: ({ rows }) => {
      websockets.emit('datasetRowsCreated', {
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
      websockets.emit('datasetRowsCreated', {
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
      websockets.emit('datasetRowsCreated', {
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
