'use server'

import { z } from 'zod'
import { updateDatasetRow } from '@latitude-data/core/services/datasetRows/update'
import {
  DatasetRowsRepository,
  DatasetsV2Repository,
} from '@latitude-data/core/repositories'
import { authProcedure } from '$/actions/procedures'
import { DatasetRowDataContent } from '@latitude-data/core/schema'

const rowDataSchema = z.record(
  z.custom<DatasetRowDataContent>((val) => {
    return (
      ['string', 'number', 'boolean'].includes(typeof val) ||
      val === null ||
      val === undefined
    )
  }),
)

export const updateDatasetRowAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      datasetId: z.number(),
      rows: z.array(
        z.object({
          rowId: z.number(),
          rowData: rowDataSchema,
        }),
      ),
    }),
    { type: 'json' },
  )
  .handler(async ({ ctx, input }) => {
    const datasetRepo = new DatasetsV2Repository(ctx.workspace.id)
    const dataset = await datasetRepo
      .find(input.datasetId)
      .then((r) => r.unwrap())
    const scope = new DatasetRowsRepository(ctx.workspace.id)
    const rows = await scope.findManyByDataset({
      dataset,
      rowIds: input.rows.map((r) => r.rowId),
    })
    const rowsByRowId = new Map(input.rows.map((r) => [r.rowId, r]))
    const rowsMap = rows.map((r) => ({
      rowId: rowsByRowId.get(r.id)!.rowId,
      rowData: rowsByRowId.get(r.id)!.rowData,
    }))

    return updateDatasetRow({
      dataset,
      data: { rows: rowsMap },
    }).then((r) => r.unwrap())
  })
