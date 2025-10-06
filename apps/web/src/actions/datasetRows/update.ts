'use server'

import { z } from 'zod'
import { updateDatasetRow } from '@latitude-data/core/services/datasetRows/update'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { authProcedure } from '$/actions/procedures'
import { DatasetRowDataContent } from '@latitude-data/core/schema/models/datasetRows'

const rowDataSchema = z.record(
  z.string(),
  z.custom<DatasetRowDataContent>(
    (val): val is DatasetRowDataContent =>
      val === null ||
      val === undefined ||
      ['string', 'number', 'boolean', 'object'].includes(typeof val),
    { message: 'Invalid row data' },
  ),
)

export const updateDatasetRowAction = authProcedure
  .inputSchema(
    z.object({
      datasetId: z.number(),
      rows: z.array(
        z.object({
          rowId: z.number(),
          rowData: rowDataSchema,
        }),
      ),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const datasetRepo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await datasetRepo
      .find(parsedInput.datasetId)
      .then((r) => r.unwrap())
    const scope = new DatasetRowsRepository(ctx.workspace.id)
    const rows = await scope.findManyByDataset({
      dataset,
      rowIds: parsedInput.rows.map((r) => r.rowId),
    })
    const rowsByRowId = new Map(parsedInput.rows.map((r) => [r.rowId, r]))
    const rowsMap = rows.map((r) => ({
      rowId: rowsByRowId.get(r.id)!.rowId,
      rowData: rowsByRowId.get(r.id)!.rowData,
    }))

    return updateDatasetRow({
      dataset,
      data: { rows: rowsMap },
    }).then((r) => r.unwrap())
  })
