'use server'
import {
  SpanMetadatasRepository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import { annotateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/annotate'
import { z } from 'zod'
import {
  EvaluationResultMetadata,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/core/constants'
import { withEvaluation, withEvaluationSchema } from '../procedures'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'

export const annotateEvaluationV2Action = withEvaluation
  .inputSchema(
    withEvaluationSchema.extend({
      resultScore: z.number(),
      resultMetadata: z.custom<Partial<EvaluationResultMetadata>>().optional(),
      spanId: z.string(),
      traceId: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const spansRepo = new SpansRepository(ctx.workspace.id)
    const spansMetadataRepo = new SpanMetadatasRepository(ctx.workspace.id)
    const span = await spansRepo
      .get({
        traceId: parsedInput.traceId,
        spanId: parsedInput.spanId,
      })
      .then((r) => r.value)
    if (!span) throw new NotFoundError('Span not found')
    if (span.type !== SpanType.Prompt)
      throw new BadRequestError('Span is not of type prompt')

    const metadata = await spansMetadataRepo
      .get({ spanId: parsedInput.spanId, traceId: parsedInput.traceId })
      .then((r) => r.value)
    if (!metadata) throw new NotFoundError('Span metadata not found')

    const result = await annotateEvaluationV2({
      resultScore: parsedInput.resultScore,
      resultMetadata: parsedInput.resultMetadata,
      evaluation: ctx.evaluation,
      span: { ...span, metadata } as SpanWithDetails<SpanType.Prompt>,
      commit: ctx.commit,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
