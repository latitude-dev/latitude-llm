'use server'

import { publisher } from '@latitude-data/core/events/publisher'
import { setupQueues } from '@latitude-data/core/jobs'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

import { refineParameters, withDataset } from '../evaluations/_helpers'

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
          await refineParameters({ ctx, parameters, refineCtx })
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

    const queues = await setupQueues()

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
