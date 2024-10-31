import { env } from '@latitude-data/env'

import {
  EvaluationConfigurationBoolean,
  EvaluationConfigurationNumerical,
  EvaluationConfigurationText,
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeAdvanced,
  EvaluationMetadataLlmAsJudgeSimple,
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationResultConfiguration,
  findFirstModelForProvider,
  IEvaluationConfiguration,
  IEvaluationMetadata,
  Providers,
  User,
  Workspace,
} from '../../browser'
import { Database, database } from '../../client'
import { findEvaluationTemplateById } from '../../data-access'
import { publisher } from '../../events/publisher'
import {
  BadRequestError,
  NotFoundError,
  PromisedResult,
  Result,
  Transaction,
} from '../../lib'
import { ProviderApiKeysRepository } from '../../repositories'
import {
  evaluationConfigurationBoolean,
  evaluationConfigurationNumerical,
  evaluationConfigurationText,
  evaluationMetadataLlmAsJudgeAdvanced,
  evaluationMetadataLlmAsJudgeSimple,
  evaluations,
} from '../../schema'
import { connectEvaluations } from './connect'

export async function createEvaluation<
  M extends EvaluationMetadataType,
  R extends EvaluationResultableType,
>(
  {
    workspace,
    user,
    name,
    description,
    metadataType,
    metadata,
    resultType,
    resultConfiguration,
    projectId,
    documentUuid,
  }: {
    workspace: Workspace
    user: User
    name: string
    description: string
    metadataType: M
    metadata: M extends EvaluationMetadataType.LlmAsJudgeSimple
      ? Omit<EvaluationMetadataLlmAsJudgeSimple, 'id'>
      : M extends EvaluationMetadataType.LlmAsJudgeAdvanced
        ? Omit<EvaluationMetadataLlmAsJudgeAdvanced, 'id'>
        : never
    resultType: R
    resultConfiguration: R extends EvaluationResultableType.Boolean
      ? Omit<EvaluationConfigurationBoolean, 'id'>
      : R extends EvaluationResultableType.Number
        ? Omit<EvaluationConfigurationNumerical, 'id'>
        : R extends EvaluationResultableType.Text
          ? Omit<EvaluationConfigurationText, 'id'>
          : never
    projectId?: number
    documentUuid?: string
  },
  db = database,
): PromisedResult<EvaluationDto> {
  const metadataTables = {
    [EvaluationMetadataType.LlmAsJudgeAdvanced]:
      evaluationMetadataLlmAsJudgeAdvanced,
    [EvaluationMetadataType.LlmAsJudgeSimple]:
      evaluationMetadataLlmAsJudgeSimple,
  } as const

  if (!metadataTables[metadataType]) {
    return Result.error(
      new BadRequestError(`Invalid metadata type ${metadataType}`),
    )
  }

  const configurationTables = {
    [EvaluationResultableType.Boolean]: evaluationConfigurationBoolean,
    [EvaluationResultableType.Number]: evaluationConfigurationNumerical,
    [EvaluationResultableType.Text]: evaluationConfigurationText,
  } as const

  if (!configurationTables[resultType]) {
    return Result.error(
      new BadRequestError(`Invalid result type ${resultType}`),
    )
  }

  return await Transaction.call(async (tx) => {
    const metadataRow = (await tx
      .insert(metadataTables[metadataType])
      .values([metadata])
      .returning()
      .then((r) => r[0]!)) as IEvaluationMetadata

    const configurationRow = (await tx
      .insert(configurationTables[resultType])
      .values([resultConfiguration])
      .returning()
      .then((r) => r[0]!)) as IEvaluationConfiguration

    const evaluation = await tx
      .insert(evaluations)
      .values([
        {
          workspaceId: workspace.id,
          name,
          description,
          metadataType,
          metadataId: metadataRow.id,
          resultType,
          resultConfigurationId: configurationRow.id,
        },
      ])
      .returning()
      .then((r) => r[0]!)

    if (projectId && documentUuid) {
      await connectEvaluations({
        workspace,
        documentUuid,
        evaluationUuids: [evaluation.uuid],
        user,
      })
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

    const evaluationDto = {
      ...evaluation,
      metadata: metadataRow,
      resultConfiguration: configurationRow,
    } as EvaluationDto

    return Result.ok(evaluationDto)
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

  return await createAdvancedEvaluation(
    {
      user,
      workspace,
      name: template.name,
      description: template.description,
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
      return Result.error(
        new BadRequestError('Range is required for number evaluations'),
      )
    } else {
      const { from, to } = config.detail.range
      if (from >= to) {
        return Result.error(
          new BadRequestError('Invalid range to has to be greater than from'),
        )
      }
    }
  }
  return Result.nil()
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

export async function createAdvancedEvaluation(
  {
    workspace,
    configuration,
    metadata,
    ...props
  }: {
    workspace: Workspace
    user: User
    name: string
    description: string
    configuration: EvaluationResultConfiguration
    metadata: { prompt: string; templateId?: number }
    projectId?: number
    documentUuid?: string
  },
  db = database,
): PromisedResult<EvaluationDto> {
  const validConfig = validateConfiguration(configuration)
  if (validConfig.error) return validConfig

  const provider = await findProvider(workspace, db)
  if (!provider) {
    return Result.error(
      new NotFoundError(
        'In order to create an evaluation you need to first create a provider API key from OpenAI or Anthropic',
      ),
    )
  }

  const promptWithProvider = provider
    ? `---
provider: ${provider.name}
model: ${findFirstModelForProvider(provider.provider)}
---
${metadata.prompt}
`.trim()
    : metadata.prompt

  const resultConfiguration = (
    configuration.type === EvaluationResultableType.Number
      ? {
          minValue: configuration.detail!.range.from,
          maxValue: configuration.detail!.range.to,
        }
      : {}
  ) as IEvaluationConfiguration

  return createEvaluation(
    {
      workspace,
      ...props,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      metadata: {
        prompt: promptWithProvider,
        configuration,
        templateId: metadata.templateId ?? null,
      } as Omit<EvaluationMetadataLlmAsJudgeAdvanced, 'id'>,
      resultType: configuration.type,
      resultConfiguration,
    },
    db,
  )
}
