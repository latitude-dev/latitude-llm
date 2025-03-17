'use server'

import { publisher } from '@latitude-data/core/events/publisher'
import { setupQueues } from '@latitude-data/core/jobs'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { nanoid } from 'nanoid'
import { z } from 'zod'

import { refineParameters, withDataset } from './_helpers'

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
          await refineParameters({ ctx, parameters, refineCtx })
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
    const queues = await setupQueues()
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
