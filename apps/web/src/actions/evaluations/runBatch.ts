'use server'

import { publisher } from '@latitude-data/core/events/publisher'
import { setupQueues } from '@latitude-data/core/jobs'
import {
  EvaluationsRepository,
  EvaluationsV2Repository,
} from '@latitude-data/core/repositories'
import { nanoid } from 'nanoid'
import { z } from 'zod'

import { refineParameters, withDataset } from './_helpers'

export const runBatchEvaluationAction = withDataset
  .createServerAction()
  .input(async ({ ctx }) =>
    z.object({
      evaluationIds: z.array(z.number()).optional(),
      evaluationUuids: z.array(z.string()).optional(),
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
    let evaluations = []

    if (input.evaluationUuids) {
      const evaluationsRepository = new EvaluationsV2Repository(
        ctx.workspace.id,
      )
      evaluations = await evaluationsRepository
        .listAtCommitByDocument({
          projectId: ctx.project.id,
          commitUuid: ctx.commit.uuid,
          documentUuid: ctx.document.documentUuid,
        })
        .then((r) => r.unwrap())
      evaluations = evaluations
        .filter((e) => input.evaluationUuids!.includes(e.uuid))
        .map((e) => ({ ...e, version: 'v2' }))

      if (evaluations.length === 0) return { success: true }

      publisher.publishLater({
        type: 'batchEvaluationRunRequested',
        data: {
          commitId: ctx.commit.id,
          documentUuid: ctx.document.documentUuid,
          evaluationUuids: input.evaluationUuids!,
          workspaceId: ctx.workspace.id,
          userEmail: ctx.user.email,
          version: 'v2',
        },
      })
    } else {
      const evaluationsRepo = new EvaluationsRepository(ctx.workspace.id)
      evaluations = await evaluationsRepo
        .filterById(input.evaluationIds!)
        .then((r) => r.unwrap())
      evaluations = evaluations.map((e) => ({ ...e, version: 'v1' }))

      if (evaluations.length === 0) return { success: true }

      publisher.publishLater({
        type: 'batchEvaluationRunRequested',
        data: {
          evaluationIds: input.evaluationIds!,
          documentUuid: input.documentUuid,
          workspaceId: ctx.workspace.id,
          userEmail: ctx.user.email,
          version: 'v1',
        },
      })
    }

    const queues = await setupQueues()
    evaluations.forEach((evaluation) => {
      const batchId = `evaluation:${evaluation.uuid}:${nanoid(5)}`

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
