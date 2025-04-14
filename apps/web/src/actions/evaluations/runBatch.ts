'use server'

import { publisher } from '@latitude-data/core/events/publisher'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { evaluationsQueue } from '@latitude-data/core/queues'
import {
  EvaluationsRepository,
  EvaluationsV2Repository,
} from '@latitude-data/core/repositories'
import { getEvaluationMetricSpecification } from '@latitude-data/core/services/evaluationsV2/specifications'
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
      datasetLabel: z
        .string()
        .optional()
        .refine(
          async (datasetLabel) => {
            if (!datasetLabel) return true
            return ctx.dataset.columns.find((c) => c.name === datasetLabel)
          },
          { message: 'Label is not a valid dataset column' },
        ),
      autoRespondToolCalls: z.boolean(),
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

      evaluations.forEach((evaluation) => {
        const specification = getEvaluationMetricSpecification(evaluation)

        if (!specification.supportsBatchEvaluation) {
          throw new BadRequestError(
            `${evaluation.name} does not support batch evaluation`,
          )
        }

        if (specification.requiresExpectedOutput && !input.datasetLabel) {
          throw new BadRequestError(
            `${evaluation.name} requires a dataset label`,
          )
        }
      })

      // NOTE: If you replace this event for another for experiments
      // keep tracking `autoRespondToolCalls`
      publisher.publishLater({
        type: 'batchEvaluationRunRequested',
        data: {
          version: 'v2' as const,
          workspaceId: ctx.workspace.id,
          userEmail: ctx.user.email,
          autoRespondToolCalls: input.autoRespondToolCalls,
          commitId: ctx.commit.id,
          documentUuid: ctx.document.documentUuid,
          evaluationUuids: input.evaluationUuids!,
        },
      })
    } else {
      const evaluationsRepo = new EvaluationsRepository(ctx.workspace.id)
      evaluations = await evaluationsRepo
        .filterById(input.evaluationIds!)
        .then((r) => r.unwrap())
      evaluations = evaluations.map((e) => ({ ...e, version: 'v1' }))

      if (evaluations.length === 0) return { success: true }

      // NOTE: If you replace this event for another for experiments
      // keep tracking `autoRespondToolCalls`
      publisher.publishLater({
        type: 'batchEvaluationRunRequested',
        data: {
          version: 'v1',
          workspaceId: ctx.workspace.id,
          userEmail: ctx.user.email,
          autoRespondToolCalls: input.autoRespondToolCalls,
          evaluationIds: input.evaluationIds!,
          documentUuid: input.documentUuid,
        },
      })
    }

    evaluations.forEach((evaluation) => {
      const batchId = `evaluation:${evaluation.uuid}:${nanoid(5)}`

      evaluationsQueue.add('runBatchEvaluationJob', {
        workspace: ctx.workspace,
        user: ctx.user,
        evaluation,
        dataset: ctx.dataset,
        datasetLabel: input.datasetLabel,
        document: ctx.document,
        projectId: ctx.project.id,
        commitUuid: ctx.currentCommitUuid,
        fromLine: input.fromLine,
        toLine: input.toLine,
        parametersMap: input.parameters as Record<string, number>,
        autoRespondToolCalls: input.autoRespondToolCalls,
        batchId,
      })
    })

    return { success: true }
  })
