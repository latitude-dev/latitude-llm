import { z } from 'zod'
import { createServerActionProcedure } from 'zsa'

import { scan } from 'promptl-ai'
import { readMetadata } from '@latitude-data/compiler'
import { withDocument } from '../procedures'
import { DocumentVersion } from '@latitude-data/constants'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { Dataset } from '@latitude-data/core/browser'

export const withDataset = createServerActionProcedure(withDocument)
  .input(
    z.object({
      datasetId: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const repo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await repo.find(input.datasetId).then((r) => r.unwrap())

    return { ...ctx, dataset: dataset as Dataset }
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

type DocumentCtx = Omit<DocumentVersion, 'resolvedContent' | 'contentHash'> & {
  resolvedContent: string | null
  contentHash: string | null
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

export async function refineParameters({
  ctx,
  parameters,
  refineCtx,
}: {
  ctx: {
    document: DocumentCtx
    dataset: Dataset
  }
  parameters: Record<string, number | undefined>
  refineCtx: z.RefinementCtx
}) {
  const metadata =
    ctx.document.promptlVersion === 0
      ? await readMetadata({ prompt: ctx.document.content })
      : await scan({ prompt: ctx.document.content })
  const docParams = metadata.parameters
  const headers = ctx.dataset.columns.map((c) => c.name)
  const paramKeys = Object.keys(parameters)

  Array.from(docParams).forEach((key) => {
    const existsInDocument = paramKeys.includes(key)

    if (!existsInDocument) {
      refineCtx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parameters', key],
        message: parameterErrorMessage({
          param: key,
          message: 'Is not present in the parameters list',
        }),
      })
    }

    const valueIndex = isValidParameter(parameters[key], headers)

    if (!valueIndex) {
      refineCtx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parameters', key],
        message: parameterErrorMessage({
          param: key,
          message:
            'Has not a valid header assigned in this dataset. If you want to keep empty this parameter choose "Leave empty in that parameter"',
        }),
      })
    }
  })
}
