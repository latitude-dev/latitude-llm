import {
  DatasetsRepository,
  DatasetsV2Repository,
} from '@latitude-data/core/repositories'
import { z } from 'zod'
import { createServerActionProcedure } from 'zsa'

import { withDocument } from '../procedures'
import { DatasetVersion } from '@latitude-data/constants'
import { Dataset, DatasetV2 } from '@latitude-data/core/browser'

export const withDataset = createServerActionProcedure(withDocument)
  .input(
    z.object({
      datasetId: z.number(),
      datasetVersion: z.nativeEnum(DatasetVersion),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const datasetVersion = input.datasetVersion
    let response = { ...ctx, datasetVersion }

    // DEPRECATED
    if (datasetVersion === DatasetVersion.V1) {
      const datasetsRepo = new DatasetsRepository(ctx.workspace.id)
      const dataset = await datasetsRepo
        .find(input.datasetId)
        .then((r) => r.unwrap())
      return { ...response, dataset: dataset as Dataset }
    }

    const repo = new DatasetsV2Repository(ctx.workspace.id)
    const dataset = await repo.find(input.datasetId).then((r) => r.unwrap())

    return { ...response, dataset: dataset as DatasetV2 }
  })

export const USER_DECIDED_TO_IGNORE_THIS_PARAMETER = -1

export function isValidParameter(
  valueIndex: number | undefined,
  headers: string[],
) {
  if (valueIndex === undefined) return false
  if (valueIndex === USER_DECIDED_TO_IGNORE_THIS_PARAMETER) return true
  const hasIndex = headers[valueIndex]
  return hasIndex !== undefined
}

export function parameterErrorMessage({
  param,
  message,
}: {
  param: string
  message: string
}) {
  return `${param}: ${message}`
}
