/* import { createRowsFromUploadedDataset } from '../../services/datasetRows/createRowsFromUploadedDataset' */
/* import { WebsocketClient } from '../../websockets/workers' */
import { DatasetV2CreatedEvent } from '../events'

export async function createDatasetRowsJob({
  data: event,
}: {
  data: DatasetV2CreatedEvent
}) {
  console.log("CREATE DATASET ROWS JOB", event)

  /* const websockets = await WebsocketClient.getSocket() */
  /* return await createRowsFromUploadedDataset({ */
  /*   event, */
  /*   onRowsCreated: ({ rows }) => { */
  /*     websockets.emit('datasetRowsCreated', { */
  /*       workspaceId: event.data.workspaceId, */
  /*       data: { */
  /*         datasetId: event.data.datasetId, */
  /*         rows, */
  /*         error: null, */
  /*       }, */
  /*     }) */
  /*   }, */
  /*   onError: (error) => { */
  /*     websockets.emit('datasetRowsCreated', { */
  /*       workspaceId: event.data.workspaceId, */
  /*       data: { */
  /*         datasetId: event.data.datasetId, */
  /*         rows: null, */
  /*         error, */
  /*       }, */
  /*     }) */
  /*   }, */
  /* }) */
}
