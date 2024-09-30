import {
  EvaluationMetadataType,
  EvaluationResultConfiguration,
  findFirstModelForProvider,
  User,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { findEvaluationTemplateById } from '../../data-access'
import { publisher } from '../../events/publisher'
import { BadRequestError, Result, Transaction } from '../../lib'
import { ProviderApiKeysRepository } from '../../repositories'
import { evaluations, llmAsJudgeEvaluationMetadatas } from '../../schema'

type Props = {
  workspace: Workspace
  name: string
  description: string
  type: EvaluationMetadataType
  configuration: EvaluationResultConfiguration
  metadata?: Record<string, unknown>
  user: User
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
  }: Props,
  db = database,
) {
  const providerScope = new ProviderApiKeysRepository(workspace!.id, db)
  const providerResult = await providerScope.findFirst()
  const provider = providerResult.unwrap()
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

    publisher.publishLater({
      type: 'evaluationCreated',
      data: {
        evaluation: result[0]!,
        workspaceId: workspace.id,
        userEmail: user.email,
      },
    })

    return Result.ok({
      ...result[0]!,
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
