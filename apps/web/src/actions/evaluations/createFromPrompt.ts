'use server'

import {
  EvaluationMetadataType,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { createEvaluation } from '@latitude-data/core/services/evaluations/create'
import { z } from 'zod'

import { withDocument } from '../procedures'

export const createEvaluationFromPromptAction = withDocument
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      prompt: z.string(),
      type: z.union([z.literal('number'), z.literal('boolean')]),
      metadata: z
        .object({
          range: z.object({
            from: z.number(),
            to: z.number(),
          }),
        })
        .optional(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const result = await createEvaluation({
      workspace: ctx.workspace,
      name: input.name,
      description: 'AI-generated evaluation',
      type: EvaluationMetadataType.LlmAsJudge,
      configuration: {
        type:
          input.type === 'number'
            ? EvaluationResultableType.Number
            : EvaluationResultableType.Boolean,
        detail: input.type === 'number' ? input.metadata : undefined,
      },
      metadata: {
        prompt: input.prompt,
      },
      user: ctx.user,
      projectId: ctx.project.id,
      documentUuid: ctx.document.documentUuid,
    })

    return result.unwrap()
  })
