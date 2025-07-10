import {
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
  LlmEvaluationCustomLabeledSpecification as specification,
} from '../../../browser'
import { database } from '../../../client'
import { BadRequestError } from '../../../lib/errors'
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
  db = database,
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
  db = database,
) {
  if (!expectedOutput) {
    throw new BadRequestError('Expected output is required')
  }

  const result = (await LlmEvaluationCustomSpecification.run(
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
  )) as EvaluationResultValue<EvaluationType.Llm, LlmEvaluationMetric.Custom>

  return !result.error
    ? {
        ...result,
        metadata: {
          ...result.metadata,
          expectedOutput: expectedOutput,
        },
      }
    : result
}
