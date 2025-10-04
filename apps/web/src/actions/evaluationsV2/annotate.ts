'use server'
import { ProviderLogsRepository } from '@latitude-data/core/repositories'
import { annotateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/annotate'
import serializeProviderLog from '@latitude-data/core/services/providerLogs/serialize'
import { z } from 'zod'
import { withEvaluation } from '../procedures'
import { EvaluationResultMetadata } from '@latitude-data/core/constants'

export const annotateEvaluationV2Action = withEvaluation
  .createServerAction()
  .input(
    z.object({
      resultScore: z.number(),
      resultMetadata: z.custom<Partial<EvaluationResultMetadata>>().optional(),
      providerLogUuid: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const providerLogsRepository = new ProviderLogsRepository(ctx.workspace.id)
    const providerLog = await providerLogsRepository
      .findByUuid(input.providerLogUuid)
      .then((r) => r.unwrap())
      .then((r) => serializeProviderLog(r))

    const result = await annotateEvaluationV2({
      resultScore: input.resultScore,
      resultMetadata: input.resultMetadata,
      evaluation: ctx.evaluation,
      providerLog: providerLog,
      commit: ctx.commit,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
