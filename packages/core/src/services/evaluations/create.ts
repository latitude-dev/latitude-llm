import { env } from '@latitude-data/env'

import {
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationResultConfiguration,
  findFirstModelForProvider,
  Providers,
  User,
  Workspace,
} from '../../browser'
import { Database, database } from '../../client'
import { findEvaluationTemplateById } from '../../data-access'
import { publisher } from '../../events/publisher'
import { BadRequestError, NotFoundError, Result, Transaction } from '../../lib'
import { ProviderApiKeysRepository } from '../../repositories'
import {
  connectedEvaluations,
  evaluations,
  llmAsJudgeEvaluationMetadatas,
} from '../../schema'

type Props = {
  workspace: Workspace
  name: string
  description: string
  type: EvaluationMetadataType
  configuration: EvaluationResultConfiguration
  metadata?: Record<string, unknown>
  user: User
  projectId?: number
  documentUuid?: string
}

export async function createEvaluation(
  {
    workspace,
    name,
    description,
    type,
    configuration,
    user,
    metadata = {},
    projectId,
    documentUuid,
  }: Props,
  db = database,
) {
  const provider = await findProvider(workspace, db)
  if (!provider) {
    return Result.error(
      new NotFoundError(
        'In order to create an evaluation you need to first create a provider API key from OpenAI or Anthropic',
      ),
    )
  }

  const meta = metadata as { prompt: string; templateId?: number }
  const promptWithProvider = provider
    ? `---
provider: ${provider.name}
model: ${findFirstModelForProvider(provider.provider)}
---
${meta.prompt}
`.trim()
    : meta.prompt

  return await Transaction.call(async (tx) => {
    let metadataTable
    switch (type) {
      case EvaluationMetadataType.LlmAsJudge:
        metadataTable = await tx
          .insert(llmAsJudgeEvaluationMetadatas)
          .values({ prompt: promptWithProvider, templateId: meta.templateId })
          .returning()

        break
      default:
        return Result.error(
          new BadRequestError(`Invalid evaluation type ${type}`),
        )
    }

    validateConfiguration(configuration)

    const result = await tx
      .insert(evaluations)
      .values([
        {
          configuration,
          description,
          metadataId: metadataTable[0]!.id,
          metadataType: type,
          name,
          workspaceId: workspace.id,
        },
      ])
      .returning()

    const evaluation = result[0]!

    // If projectId and documentUuid are provided, connect the evaluation
    if (projectId && documentUuid) {
      // TODO: Move to a connectEvaluation service
      await tx
        .insert(connectedEvaluations)
        .values({
          documentUuid,
          evaluationId: evaluation.id,
        })
        .returning()
    }

    publisher.publishLater({
      type: 'evaluationCreated',
      data: {
        evaluation,
        workspaceId: workspace.id,
        userEmail: user.email,
        projectId,
        documentUuid,
      },
    })

    return Result.ok({
      ...evaluation,
      metadata: metadataTable[0]!,
    })
  }, db)
}

export async function importLlmAsJudgeEvaluation(
  {
    workspace,
    user,
    templateId,
  }: { workspace: Workspace; user: User; templateId: number },
  db = database,
) {
  const templateResult = await findEvaluationTemplateById(templateId, db)
  if (templateResult.error) return templateResult
  const template = templateResult.unwrap()

  return await createEvaluation(
    {
      user,
      workspace,
      name: template.name,
      description: template.description,
      type: EvaluationMetadataType.LlmAsJudge,
      configuration: template.configuration,
      metadata: {
        prompt: template.prompt,
        templateId: template.id,
      },
    },
    db,
  )
}

function validateConfiguration(config: EvaluationResultConfiguration) {
  if (config.type === EvaluationResultableType.Number) {
    if (!config.detail?.range) {
      throw new BadRequestError('Range is required for number evaluations')
    } else {
      const { from, to } = config.detail.range
      if (from >= to) {
        throw new BadRequestError(
          'Invalid range to has to be greater than from',
        )
      }
    }
  }
}

async function findProvider(workspace: Workspace, db: Database) {
  const providerScope = new ProviderApiKeysRepository(workspace!.id, db)
  const providers = await providerScope.findAll().then((r) => r.unwrap())
  const found = providers.find((p) => {
    if (
      [Providers.OpenAI, Providers.Anthropic].includes(p.provider) &&
      p.token !== env.DEFAULT_PROVIDER_API_KEY
    ) {
      return true
    }

    return false
  })

  if (found) return found

  return providers.find((p) => p.token === env.DEFAULT_PROVIDER_API_KEY)
}
