'use server'

import { readMetadata } from '@latitude-data/compiler'
import {
  DatasetsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { setupJobs } from '@latitude-data/jobs'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { createServerActionProcedure } from 'zsa'

import { withDocument } from '../procedures'

const USER_DECIDED_TO_IGNORE_THIS_PARAMETER = -1

const withDataset = createServerActionProcedure(withDocument)
  .input(z.object({ datasetId: z.number() }))
  .handler(async ({ input, ctx }) => {
    const datasetsRepo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await datasetsRepo
      .find(input.datasetId)
      .then((r) => r.unwrap())

    return { ...ctx, dataset }
  })

function isValidParameter(valueIndex: number | undefined, headers: string[]) {
  if (valueIndex === undefined) return false
  if (valueIndex === USER_DECIDED_TO_IGNORE_THIS_PARAMETER) return true
  const hasIndex = headers[valueIndex]
  return hasIndex !== undefined
}
function parameterErrorMessage({
  param,
  message,
}: {
  param: string
  message: string
}) {
  return `${param}: ${message}`
}

export const runBatchEvaluationAction = withDataset
  .createServerAction()
  .input(async ({ ctx }) => {
    return z.object({
      evaluationIds: z.array(z.number()),
      fromLine: z.number().optional(),
      toLine: z.number().optional(),
      parameters: z
        .record(z.number().optional())
        .optional()
        .superRefine(async (parameters = {}, refineCtx) => {
          const metadata = await readMetadata({
            prompt: ctx.document.content ?? '',
            fullPath: ctx.document.path,
          })
          const docParams = metadata.parameters
          const headers = ctx.dataset.fileMetadata.headers
          const paramKeys = Object.keys(parameters)
          Array.from(docParams).forEach((key) => {
            const existsInDocument = paramKeys.includes(key)

            if (!existsInDocument) {
              refineCtx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['parameters', key],
                message: parameterErrorMessage({
                  param: key,
                  message: 'Is not a valid parameter in this document',
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
        }),
    })
  })
  .handler(async ({ input, ctx }) => {
    const evaluationsRepo = new EvaluationsRepository(ctx.workspace.id)
    const evaluations = await evaluationsRepo
      .filterById(input.evaluationIds)
      .then((r) => r.unwrap())
    const queues = await setupJobs()
    evaluations.forEach((evaluation) => {
      const batchId = `evaluation:${evaluation.id}:${nanoid(5)}`

      queues.defaultQueue.jobs.enqueueRunBatchEvaluationJob({
        workspace: ctx.workspace,
        user: ctx.user,
        evaluation,
        dataset: ctx.dataset,
        document: ctx.document,
        projectId: ctx.project.id,
        commitUuid: ctx.currentCommitUuid,
        fromLine: input.fromLine,
        toLine: input.toLine,
        parametersMap: input.parameters,
        batchId,
      })
    })

    return { success: true }
  })
