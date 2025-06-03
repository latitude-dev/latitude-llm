'use server'

import { z } from 'zod'
import {
  DATASET_COLUMN_ROLES,
  DatasetColumnRole,
} from '@latitude-data/core/browser'
import { nanoidHashAlgorithm } from '@latitude-data/core/services/datasets/utils'
import { updateDataset } from '@latitude-data/core/services/datasets/update'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { authProcedure } from '../procedures'

const datasetColumnRoleSchema = z.enum(
  Object.values(DATASET_COLUMN_ROLES) as [
    DatasetColumnRole,
    ...DatasetColumnRole[],
  ],
)

export const createDatasetColumnAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      datasetId: z.string(),
      name: z.string().min(1, { message: 'Name is required' }),
      role: datasetColumnRoleSchema,
    }),
  )
  .handler(async ({ input, ctx }) => {
    const repo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await repo.find(input.datasetId).then((r) => r.unwrap())

    const newColumn = {
      identifier: nanoidHashAlgorithm({ columnName: input.name }),
      name: input.name,
      role: input.role,
    }

    const columns = [...dataset.columns, newColumn]

    return updateDataset({
      dataset,
      data: { columns },
    }).then((r) => r.unwrap())
  })
