'use server'

import { readMetadata } from '@latitude-data/compiler'
import { publisher } from '@latitude-data/core/events/publisher'
import { setupJobs } from '@latitude-data/core/jobs'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

import {
  isValidParameter,
  parameterErrorMessage,
  withDataset,
} from '../evaluations/_helpers'

export const runDocumentInBatchAction = withDataset
  .createServerAction()
  .input(async ({ ctx }) =>
    z.object({
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
    }),
  )
  .handler(async ({ input, ctx }) => {
    publisher.publishLater({
      type: 'runDocumentInBatchRequested',
      data: {
        document: ctx.document,
        workspaceId: ctx.workspace.id,
        userEmail: ctx.user.email,
      },
    })

    const commitsScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitsScope
      .getCommitByUuid({ uuid: ctx.currentCommitUuid })
      .then((r) => r.unwrap())

    const queues = await setupJobs()

    queues.defaultQueue.jobs.enqueueRunDocumentInBatchJob({
      commit,
      document: ctx.document,
      dataset: ctx.dataset,
      workspace: ctx.workspace,
      parametersMap: input.parameters as Record<string, number>,
      fromLine: input.fromLine,
      toLine: input.toLine,
    })

    return { success: true }
  })
