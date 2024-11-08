'use server'

import {
  EvaluationMetadataLlmAsJudgeAdvanced,
  EvaluationMetadataLlmAsJudgeSimple,
  EvaluationMetadataType,
  findFirstModelForProvider,
  resultConfigurationSchema,
  Workspace,
} from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { createEvaluation } from '@latitude-data/core/services/evaluations/create'
import { findDefaultProvider } from '@latitude-data/core/services/providerApiKeys/findDefaultProvider'
import { z } from 'zod'

import { authProcedure } from '../procedures'

const advancedEvaluationMetadataSchema = z.object({
  type: z.literal(EvaluationMetadataType.LlmAsJudgeAdvanced),
  prompt: z.string(),
})
const simpleEvaluationMetadataSchema = z.object({
  type: z.literal(EvaluationMetadataType.LlmAsJudgeSimple),
  providerApiKeyId: z.number().optional(),
  model: z.string().optional(),
  objective: z.string(),
  additionalInstructions: z.string(),
})

export const createEvaluationAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string(),
      description: z.string(),
      resultConfiguration: resultConfigurationSchema,
      metadata: z.union([
        advancedEvaluationMetadataSchema,
        simpleEvaluationMetadataSchema,
      ]),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const metadata = await enrichWithProvider({
      metadata: input.metadata,
      workspace: ctx.workspace,
    })

    const result = await createEvaluation({
      workspace: ctx.workspace,
      user: ctx.user,
      name: input.name,
      description: input.description,
      metadataType: input.metadata.type,
      metadata,
      resultType: input.resultConfiguration.type,
      resultConfiguration: input.resultConfiguration,
    })

    return result.unwrap()
  })

async function enrichWithProvider({
  metadata,
  workspace,
}: {
  metadata: z.infer<
    | typeof advancedEvaluationMetadataSchema
    | typeof simpleEvaluationMetadataSchema
  >
  workspace: Workspace
}): Promise<
  EvaluationMetadataLlmAsJudgeSimple | EvaluationMetadataLlmAsJudgeAdvanced
> {
  const { type: _, ...rest } = metadata

  if (metadata.type === EvaluationMetadataType.LlmAsJudgeAdvanced)
    return rest as EvaluationMetadataLlmAsJudgeAdvanced
  if (
    metadata.type === EvaluationMetadataType.LlmAsJudgeSimple &&
    metadata.providerApiKeyId &&
    metadata.model
  ) {
    return rest as EvaluationMetadataLlmAsJudgeSimple
  }

  const provider = await findDefaultProvider(workspace)
  if (!provider)
    throw new NotFoundError(
      `No default provider found for workspace ${workspace.id}`,
    )

  const model = findFirstModelForProvider(provider.provider)
  if (!model)
    throw new NotFoundError(
      `No default model found for provider ${provider.provider}`,
    )

  return {
    ...rest,
    providerApiKeyId: provider.id,
    model,
  } as EvaluationMetadataLlmAsJudgeSimple
}
