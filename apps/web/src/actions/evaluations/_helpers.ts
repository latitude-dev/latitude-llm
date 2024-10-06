import { DatasetsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'
import { createServerActionProcedure } from 'zsa'

import { withDocument } from '../procedures'

export const withDataset = createServerActionProcedure(withDocument)
  .input(z.object({ datasetId: z.number() }))
  .handler(async ({ input, ctx }) => {
    const datasetsRepo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await datasetsRepo
      .find(input.datasetId)
      .then((r) => r.unwrap())

    return { ...ctx, dataset }
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
