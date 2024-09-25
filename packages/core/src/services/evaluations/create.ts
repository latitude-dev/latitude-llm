import {
  EvaluationMetadataType,
  EvaluationResultConfiguration,
  findFirstModelForProvider,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { findEvaluationTemplateById } from '../../data-access'
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
}

export async function createEvaluation(
  { workspace, name, description, type, configuration, metadata = {} }: Props,
  db = database,
) {
  const providerScope = new ProviderApiKeysRepository(workspace!.id, db)
  const providerResult = await providerScope.findFirst()
  const provider = providerResult.unwrap()

  if (!provider) {
    return Result.error(
      new BadRequestError('No provider found when creating evaluation'),
    )
  }
  const meta = metadata as { prompt: string; templateId?: number }
  const promptWithProvider = `---
provider: ${provider.name}
model: ${findFirstModelForProvider(provider.provider)}
---
${meta.prompt}
`.trim()

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

    return Result.ok({
      ...result[0]!,
      metadata: metadataTable[0]!,
    })
  }, db)
}

export async function importLlmAsJudgeEvaluation(
  { workspace, templateId }: { workspace: Workspace; templateId: number },
  db = database,
) {
  const templateResult = await findEvaluationTemplateById(templateId, db)
  if (templateResult.error) return templateResult
  const template = templateResult.unwrap()

  return await createEvaluation(
    {
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
