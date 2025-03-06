import {
  DatasetsRepository,
  DatasetsV2Repository,
} from '@latitude-data/core/repositories'
import { z } from 'zod'
import { createServerActionProcedure } from 'zsa'

import { scan } from 'promptl-ai'
import { readMetadata } from '@latitude-data/compiler'
import { withDocument } from '../procedures'
import { DatasetVersion, DocumentVersion } from '@latitude-data/constants'
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
    dataset: Dataset | DatasetV2
    datasetVersion: DatasetVersion
  }
  parameters: Record<string, number | undefined>
  refineCtx: z.RefinementCtx
}) {
  const metadata =
    ctx.document.promptlVersion === 0
      ? await readMetadata({ prompt: ctx.document.content })
      : await scan({ prompt: ctx.document.content })
  const docParams = metadata.parameters
  const version = ctx.datasetVersion
  const headers =
    version === DatasetVersion.V1 && 'fileMetadata' in ctx.dataset
      ? ctx.dataset.fileMetadata.headers
      : 'columns' in ctx.dataset
        ? ctx.dataset.columns.map((c) => c.name)
        : [] // Should not happen
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
