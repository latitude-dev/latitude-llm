import {
  ErrorableEntity,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
  LlmEvaluationCustomLabeledSpecification as specification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { BadRequestError } from '../../../lib/errors'
import { createRunError } from '../../runErrors/create'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
} from '../shared'
import { LlmEvaluationCustomSpecification } from './custom'

export const LlmEvaluationCustomLabeledSpecification = {
  ...LlmEvaluationCustomSpecification,
  ...specification,
  validate: validate,
  run: run,
}

async function validate(
  {
    ...rest
  }: EvaluationMetricValidateArgs<
    EvaluationType.Llm,
    LlmEvaluationMetric.CustomLabeled
  >,
  db: Database = database,
) {
  return await LlmEvaluationCustomSpecification.validate({ ...rest }, db)
}

async function run(
  {
    resultUuid,
    evaluation,
    expectedOutput,
    ...rest
  }: EvaluationMetricRunArgs<
    EvaluationType.Llm,
    LlmEvaluationMetric.CustomLabeled
  >,
  db: Database = database,
) {
  try {
    if (!expectedOutput) {
      throw new BadRequestError('Expected output is required')
    }

    const result = await LlmEvaluationCustomSpecification.run(
      {
        resultUuid: resultUuid,
        evaluation: evaluation as unknown as EvaluationV2<
          EvaluationType.Llm,
          LlmEvaluationMetric.Custom
        >,
        expectedOutput: expectedOutput,
        ...rest,
      },
      db,
    )

    return !result.error
      ? {
          ...result,
          metadata: {
            ...result.metadata,
            expectedOutput: expectedOutput,
          },
        }
      : result
  } catch (error) {
    let runError
    if (error instanceof ChainError) {
      runError = await createRunError(
        {
          data: {
            errorableUuid: resultUuid,
            errorableType: ErrorableEntity.EvaluationResult,
            code: error.errorCode,
            message: error.message,
            details: error.details,
          },
        },
        db,
      ).then((r) => r.unwrap())
    }

    return {
      error: { message: (error as Error).message, runErrorId: runError?.id },
    }
  }
}
