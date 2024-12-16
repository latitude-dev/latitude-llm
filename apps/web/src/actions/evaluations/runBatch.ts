'use server'

import { readMetadata } from '@latitude-data/compiler'
import { publisher } from '@latitude-data/core/events/publisher'
import { setupJobs } from '@latitude-data/core/jobs'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { scan } from 'promptl-ai'
import { nanoid } from 'nanoid'
import { z } from 'zod'

import {
  isValidParameter,
  parameterErrorMessage,
  withDataset,
} from './_helpers'

export const runBatchEvaluationAction = withDataset
  .createServerAction()
  .input(async ({ ctx }) =>
    z.object({
      evaluationIds: z.array(z.number()),
      fromLine: z.number().optional(),
      toLine: z.number().optional(),
      parameters: z
        .record(z.number().optional())
        .optional()
        .superRefine(async (parameters = {}, refineCtx) => {
          const metadata =
            ctx.document.promptlVersion === 0
              ? await readMetadata({ prompt: ctx.document.content })
              : await scan({ prompt: ctx.document.content })
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
    }),
  )
  .handler(async ({ input, ctx }) => {
    publisher.publishLater({
      type: 'batchEvaluationRunRequested',
      data: {
        evaluationIds: input.evaluationIds,
        documentUuid: input.documentUuid,
        workspaceId: ctx.workspace.id,
        userEmail: ctx.user.email,
      },
    })

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
        parametersMap: input.parameters as Record<string, number>,
        batchId,
      })
    })

    return { success: true }
  })
