import { zValidator } from '@hono/zod-validator'
import {
  EvaluationMetadataType,
  resultConfigurationSchema,
} from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { connectEvaluations } from '@latitude-data/core/services/evaluations/connect'
import { createAndConnect } from '@latitude-data/core/services/evaluations/createAndConnect'
import { Factory } from 'hono/factory'
import { z } from 'zod'

const factory = new Factory()

// Reuse the same schema structure from the createEvaluationAction
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
const defaultEvaluationMetadataSchema = z.object({
  type: z.literal(EvaluationMetadataType.Manual),
})

const getOrCreateSchema = z.object({
  name: z.string(),
  description: z.string(),
  resultConfiguration: resultConfigurationSchema,
  metadata: z.discriminatedUnion('type', [
    advancedEvaluationMetadataSchema,
    simpleEvaluationMetadataSchema,
    defaultEvaluationMetadataSchema,
  ]),
  projectId: z.number().optional(),
  promptPath: z.string().optional(),
})

export const getOrCreateHandler = factory.createHandlers(
  zValidator('json', getOrCreateSchema),
  async (c) => {
    const workspace = c.get('workspace')
    const user = c.get('user')
    const input = c.req.valid('json')

    // Try to find existing evaluation by name
    const evaluationsScope = new EvaluationsRepository(workspace.id)
    const existingEvaluation = await evaluationsScope
      .findByName(input.name)
      .then((r) => r.unwrap())

    let documentUuid: string | undefined

    if (input.promptPath && input.projectId) {
      const documentsScope = new DocumentVersionsRepository(workspace.id)
      const commitsScope = new CommitsRepository(workspace.id)
      const headCommit = await commitsScope
        .getHeadCommit(input.projectId)
        .then((r) => r.unwrap())
      if (!headCommit) {
        throw new NotFoundError('No head commit found')
      }

      const document = await documentsScope
        .getDocumentByPath({
          commit: headCommit,
          path: input.promptPath,
        })
        .then((r) => r.unwrap())
      documentUuid = document.documentUuid
    }

    if (existingEvaluation) {
      if (documentUuid) {
        const connectResult = await connectEvaluations({
          workspace,
          documentUuid,
          evaluationUuids: [existingEvaluation.uuid],
          user,
        })

        if (connectResult.error) {
          throw connectResult.error
        }
      }
      return c.json(existingEvaluation)
    }

    const result = await createAndConnect({
      workspace,
      user,
      name: input.name,
      description: input.description,
      metadataType: input.metadata.type,
      metadata: input.metadata,
      resultType: input.resultConfiguration.type,
      resultConfiguration: input.resultConfiguration,
      documentUuid,
    })

    if (result.error) {
      throw result.error
    }

    return c.json(result.unwrap())
  },
)
