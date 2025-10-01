'use server'
import { ProviderLogsRepository } from '@latitude-data/core/repositories'
import { annotateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/annotate'
import serializeProviderLog from '@latitude-data/core/services/providerLogs/serialize'
import { z } from 'zod'
import { EvaluationResultMetadata } from '@latitude-data/core/constants'
import { withEvaluation, withEvaluationSchema } from '../procedures'

export const annotateEvaluationV2Action = withEvaluation
  .inputSchema(
    withEvaluationSchema.extend({
      resultScore: z.number(),
      resultMetadata: z.custom<Partial<EvaluationResultMetadata>>().optional(),
      providerLogUuid: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const providerLogsRepository = new ProviderLogsRepository(ctx.workspace.id)
    const providerLog = await providerLogsRepository
      .findByUuid(parsedInput.providerLogUuid)
      .then((r) => r.unwrap())
      .then((r) => serializeProviderLog(r))

    const result = await annotateEvaluationV2({
      resultScore: parsedInput.resultScore,
      resultMetadata: parsedInput.resultMetadata,
      evaluation: ctx.evaluation,
      providerLog: providerLog,
      commit: ctx.commit,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
