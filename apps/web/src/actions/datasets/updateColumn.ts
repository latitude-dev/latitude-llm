'use server'

import { z } from 'zod'
import { updateDatasetColumn } from '@latitude-data/core/services/datasets/updateColumn'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { authProcedure } from '../procedures'
import {
  DATASET_COLUMN_ROLES,
  DatasetColumnRole,
} from '@latitude-data/core/constants'

const datasetColumnRoleSchema = z.enum(
  Object.values(DATASET_COLUMN_ROLES) as [
    DatasetColumnRole,
    ...DatasetColumnRole[],
  ],
)
export const updateDatasetColumnAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      datasetId: z.string(),
      identifier: z.string(),
      name: z.string().min(1, { message: 'Name is required' }),
      role: datasetColumnRoleSchema,
    }),
  )
  .handler(async ({ input, ctx }) => {
    const repo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await repo.find(input.datasetId).then((r) => r.unwrap())
    return updateDatasetColumn({
      dataset,
      data: {
        identifier: input.identifier,
        name: input.name,
        role: input.role,
      },
    }).then((r) => r.unwrap())
  })
