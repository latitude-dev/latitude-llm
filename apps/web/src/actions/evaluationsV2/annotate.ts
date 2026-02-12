'use server'
import {
  SpanMetadatasRepository,
} from '@latitude-data/core/repositories'
import { findSpan } from '@latitude-data/core/queries/spans/findSpan'
import { annotateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/annotate'
import { z } from 'zod'
import {
  EvaluationResultMetadata,
  MAIN_SPAN_TYPES,
  MainSpanType,
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
      resultUuid: z.string().optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const spansMetadataRepo = new SpanMetadatasRepository(ctx.workspace.id)
    const span = await findSpan({
      workspaceId: ctx.workspace.id,
      traceId: parsedInput.traceId,
      spanId: parsedInput.spanId,
    })
    if (!span) throw new NotFoundError('Span not found')
    if (!MAIN_SPAN_TYPES.has(span.type)) {
      throw new BadRequestError('Span is not of type prompt')
    }

    const metadata = await spansMetadataRepo
      .get({ spanId: parsedInput.spanId, traceId: parsedInput.traceId })
      .then((r) => r.value)
    if (!metadata) throw new NotFoundError('Span metadata not found')

    const result = await annotateEvaluationV2({
      resultScore: parsedInput.resultScore,
      resultMetadata: parsedInput.resultMetadata,
      evaluation: ctx.evaluation,
      span: { ...span, metadata } as SpanWithDetails<MainSpanType>,
      commit: ctx.commit,
      workspace: ctx.workspace,
      currentUser: ctx.user,
      resultUuid: parsedInput.resultUuid,
    }).then((r) => r.unwrap())

    return result
  })
