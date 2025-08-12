'use server'

import { z } from 'zod'
import {
  DATASET_COLUMN_ROLES,
  DatasetColumnRole,
} from '@latitude-data/core/browser'
import { updateDatasetColumn } from '@latitude-data/core/services/datasets/updateColumn'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { authProcedure } from '../procedures'

const datasetColumnRoleSchema = z.enum(
  Object.values(DATASET_COLUMN_ROLES) as [
    DatasetColumnRole,
    ...DatasetColumnRole[],
  ],
)
export const updateDatasetColumnAction = authProcedure
  .inputSchema(
    z.object({
      datasetId: z.string(),
      identifier: z.string(),
      name: z.string().min(1, { error: 'Name is required' }),
      role: datasetColumnRoleSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const repo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await repo
      .find(parsedInput.datasetId)
      .then((r) => r.unwrap())
    return updateDatasetColumn({
      dataset,
      data: {
        identifier: parsedInput.identifier,
        name: parsedInput.name,
        role: parsedInput.role,
      },
    }).then((r) => r.unwrap())
  })
