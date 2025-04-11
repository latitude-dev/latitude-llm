import { eq } from 'drizzle-orm'

import {
  EvaluationConfigurationBoolean,
  EvaluationConfigurationNumerical,
  EvaluationConfigurationText,
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeAdvanced,
  EvaluationMetadataLlmAsJudgeSimple,
  EvaluationMetadataType,
  EvaluationResultableType,
} from '../../browser'
import {
  evaluationConfigurationBoolean,
  evaluationConfigurationNumerical,
  evaluationConfigurationText,
  evaluationMetadataLlmAsJudgeAdvanced,
  evaluationMetadataLlmAsJudgeSimple,
  evaluationMetadataManual,
} from '../../schema'
import { BadRequestError } from './../../lib/errors'
import Transaction, { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'

export async function updateEvaluation({
  evaluation,
  metadata,
  configuration,
}: {
  evaluation: EvaluationDto
  metadata?:
    | Partial<EvaluationMetadataLlmAsJudgeSimple>
    | Partial<EvaluationMetadataLlmAsJudgeAdvanced>
  configuration?:
    | Partial<EvaluationConfigurationNumerical>
    | Partial<EvaluationConfigurationBoolean>
    | Partial<EvaluationConfigurationText>
}): PromisedResult<EvaluationDto> {
  const metadataTables = {
    [EvaluationMetadataType.LlmAsJudgeAdvanced]:
      evaluationMetadataLlmAsJudgeAdvanced,
    [EvaluationMetadataType.LlmAsJudgeSimple]:
      evaluationMetadataLlmAsJudgeSimple,
    [EvaluationMetadataType.Manual]: evaluationMetadataManual,
  } as const

  if (metadata && !metadataTables[evaluation.metadataType]) {
    return Result.error(
      new BadRequestError(`Invalid metadata type ${evaluation.metadataType}`),
    )
  }

  const configurationTables = {
    [EvaluationResultableType.Boolean]: evaluationConfigurationBoolean,
    [EvaluationResultableType.Number]: evaluationConfigurationNumerical,
    [EvaluationResultableType.Text]: evaluationConfigurationText,
  } as const

  if (configuration && !configurationTables[evaluation.resultType]) {
    return Result.error(
      new BadRequestError(`Invalid result type ${evaluation.resultType}`),
    )
  }

  return await Transaction.call(async (tx) => {
    let updatedMetadata = evaluation.metadata
    if (metadata) {
      const metadataTable = metadataTables[evaluation.metadataType]
      updatedMetadata = await tx
        .update(metadataTable)
        .set(metadata)
        .where(eq(metadataTable.id, evaluation.metadataId))
        .returning()
        .then((r) => r[0]!)
    }

    let updatedConfiguration = evaluation.resultConfiguration
    if (configuration) {
      const configurationTable = configurationTables[evaluation.resultType]
      await tx
        .update(configurationTable)
        .set(configuration)
        .where(eq(configurationTable.id, evaluation.resultConfigurationId!))
        .returning()
        .then((r) => r[0]!)
    }

    const evaluationDto = {
      ...evaluation,
      metadata: updatedMetadata,
      resultConfiguration: updatedConfiguration,
    } as EvaluationDto

    return Result.ok(evaluationDto)
  })
}
