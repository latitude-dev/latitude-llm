import { env } from '@latitude-data/env'

import {
  EvaluationConfigurationBoolean,
  EvaluationConfigurationNumerical,
  EvaluationConfigurationText,
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeAdvanced,
  EvaluationMetadataLlmAsJudgeSimple,
  EvaluationMetadataManual,
  EvaluationMetadataType,
  EvaluationResultableType,
  findFirstModelForProvider,
  IEvaluationConfiguration,
  IEvaluationMetadata,
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
import {
  evaluationConfigurationBoolean,
  evaluationConfigurationNumerical,
  evaluationConfigurationText,
  evaluationMetadataLlmAsJudgeAdvanced,
  evaluationMetadataLlmAsJudgeSimple,
  evaluations,
} from '../../schema'
import { evaluationMetadataManual } from '../../schema/models/evaluationMetadataDefault'
import { findDefaultEvaluationProvider } from '../providerApiKeys/findDefaultProvider'
import { connectEvaluations } from './connect'

type EvaluationResultConfigurationNumerical = {
  minValue: number
  maxValue: number
} & Partial<
  Omit<EvaluationConfigurationNumerical, 'id' | 'minValue' | 'maxValue'>
>

type EvaluationResultConfigurationText = Partial<
  Omit<EvaluationConfigurationText, 'id'>
>

type EvaluationResultConfigurationBoolean = Partial<
  Omit<EvaluationConfigurationBoolean, 'id'>
>

type CreateEvaluationMetadata<M extends EvaluationMetadataType> =
  M extends EvaluationMetadataType.LlmAsJudgeSimple
    ? { objective: string } & Partial<
        Omit<EvaluationMetadataLlmAsJudgeSimple, 'id'>
      >
    : M extends EvaluationMetadataType.LlmAsJudgeAdvanced
      ? { prompt: string } & Partial<
          Omit<
            EvaluationMetadataLlmAsJudgeAdvanced,
            'id' | 'configuration' | 'prompt'
          >
        >
      : M extends EvaluationMetadataType.Manual
        ? Omit<EvaluationMetadataManual, 'id'>
        : never

type CreateEvaluationResultConfiguration<R extends EvaluationResultableType> =
  R extends EvaluationResultableType.Boolean
    ? EvaluationResultConfigurationBoolean
    : R extends EvaluationResultableType.Number
      ? EvaluationResultConfigurationNumerical
      : R extends EvaluationResultableType.Text
        ? EvaluationResultConfigurationText
        : never

export const configurationTables = {
  [EvaluationResultableType.Boolean]: evaluationConfigurationBoolean,
  [EvaluationResultableType.Number]: evaluationConfigurationNumerical,
  [EvaluationResultableType.Text]: evaluationConfigurationText,
} as const

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
    metadata = {} as CreateEvaluationMetadata<M>,
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
    metadata: CreateEvaluationMetadata<M>
    resultType: R
    resultConfiguration: CreateEvaluationResultConfiguration<R>
    projectId?: number
    documentUuid?: string
  },
  db = database,
): PromisedResult<EvaluationDto> {
  const validConfig = validateResultConfiguration({
    resultType,
    resultConfiguration,
  })
  if (validConfig.error) return validConfig

  const metadataTables = {
    [EvaluationMetadataType.LlmAsJudgeAdvanced]:
      evaluationMetadataLlmAsJudgeAdvanced,
    [EvaluationMetadataType.LlmAsJudgeSimple]:
      evaluationMetadataLlmAsJudgeSimple,
    [EvaluationMetadataType.Manual]: evaluationMetadataManual,
  } as const
  const metadataTable = metadataTables[metadataType]

  if (!metadataTable) {
    return Result.error(
      new BadRequestError(`Invalid metadata type ${metadataType}`),
    )
  }

  if (!configurationTables[resultType]) {
    return Result.error(
      new BadRequestError(`Invalid result type ${resultType}`),
    )
  }

  return await Transaction.call(async (tx) => {
    const enrichedMetadata = await enrichWithProvider<M>(
      {
        metadata,
        metadataType,
        workspace,
      },
      tx,
    )

    const metadataRow = (await tx
      .insert(metadataTable)
      .values([enrichedMetadata])
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
      await connectEvaluations(
        {
          workspace,
          documentUuid,
          evaluationUuids: [evaluation.uuid],
          user,
        },
        tx,
      ).then((r) => r.unwrap())
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
  const resultConfiguration =
    template.configuration.type === EvaluationResultableType.Number
      ? {
          minValue: template.configuration.detail!.range.from,
          maxValue: template.configuration.detail!.range.to,
        }
      : undefined

  return await createAdvancedEvaluation(
    {
      user,
      workspace,
      name: template.name,
      description: template.description,
      resultType: template.configuration.type,
      resultConfiguration: resultConfiguration ?? {},
      metadata: {
        prompt: template.prompt,
        templateId: template.id,
      },
    },
    db,
  )
}

export async function createAdvancedEvaluation<
  R extends EvaluationResultableType,
>(
  {
    workspace,
    resultType,
    resultConfiguration,
    metadata,
    ...props
  }: {
    workspace: Workspace
    user: User
    name: string
    description: string
    resultType: R
    resultConfiguration: R extends EvaluationResultableType.Boolean
      ? EvaluationResultConfigurationBoolean
      : R extends EvaluationResultableType.Number
        ? EvaluationResultConfigurationNumerical
        : typeof resultType extends EvaluationResultableType.Text
          ? EvaluationResultConfigurationText
          : never
    metadata: { prompt: string; templateId?: number }
    projectId?: number
    documentUuid?: string
  },
  db = database,
): PromisedResult<EvaluationDto> {
  return createEvaluation(
    {
      workspace,
      ...props,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      metadata: {
        prompt: metadata.prompt,
        configuration: resultConfiguration,
        templateId: metadata.templateId ?? null,
      } as Omit<EvaluationMetadataLlmAsJudgeAdvanced, 'id'>,
      resultType,
      resultConfiguration,
    },
    db,
  )
}

function validateResultConfiguration({
  resultType,
  resultConfiguration,
}: {
  resultType: EvaluationResultableType
  resultConfiguration:
    | EvaluationResultConfigurationNumerical
    | EvaluationResultConfigurationBoolean
    | EvaluationResultConfigurationText
}) {
  if (resultType !== EvaluationResultableType.Number) {
    return Result.ok(resultConfiguration)
  }

  const conf = resultConfiguration as EvaluationResultConfigurationNumerical
  if (conf.minValue >= conf.maxValue) {
    return Result.error(
      new BadRequestError(
        'Invalid range min value has to be less than max value',
      ),
    )
  }

  return Result.ok(resultConfiguration)
}

async function enrichWithProvider<M extends EvaluationMetadataType>(
  {
    metadata,
    metadataType,
    workspace,
  }: {
    metadata: CreateEvaluationMetadata<M>
    metadataType: M
    workspace: Workspace
  },
  db: Database,
) {
  if (
    metadataType === EvaluationMetadataType.LlmAsJudgeSimple &&
    // @ts-expect-error - Metadata is a union type and providerApiKeyId is not defined for the other types
    !metadata.providerApiKeyId
  ) {
    const provider = await findDefaultEvaluationProvider(workspace, db).then(
      (r) => r.unwrap(),
    )
    if (!provider) {
      throw new NotFoundError(
        `In order to create an evaluation you need to first create a provider API key from OpenAI or Anthropic`,
      )
    }

    const model =
      // @ts-expect-error - Metadata is a union type and model is not defined for the other types
      metadata.model ||
      findFirstModelForProvider({
        provider: provider,
        latitudeProvider: env.DEFAULT_PROVIDER_ID,
      })
    if (!model) {
      throw new NotFoundError(
        `In order to create an evaluation you need to first create a provider API key from OpenAI or Anthropic`,
      )
    }

    metadata = {
      ...metadata,
      model,
      providerApiKeyId: provider.id,
    }
  }

  if (metadataType === EvaluationMetadataType.LlmAsJudgeAdvanced) {
    const provider = await findDefaultEvaluationProvider(workspace, db).then(
      (r) => r.unwrap(),
    )
    if (!provider) {
      throw new NotFoundError(
        `In order to create an evaluation you need to first create a provider API key from OpenAI or Anthropic`,
      )
    }

    const model = findFirstModelForProvider({
      provider: provider,
      latitudeProvider: env.DEFAULT_PROVIDER_ID,
    })
    if (!model) {
      throw new NotFoundError(
        `In order to create an evaluation you need to first create a provider API key from OpenAI or Anthropic`,
      )
    }

    const promptWithProvider = `---
provider: ${provider.name}
model: ${model}
---
${
  // @ts-expect-error - Metadata is a union type and prompt is not defined for the other types
  metadata.prompt
}`.trim()

    metadata = {
      ...metadata,
      prompt: promptWithProvider,
    }
  }

  return metadata as M extends EvaluationMetadataType.LlmAsJudgeSimple
    ? Omit<EvaluationMetadataLlmAsJudgeSimple, 'id'>
    : Omit<EvaluationMetadataLlmAsJudgeAdvanced, 'id'>
}
