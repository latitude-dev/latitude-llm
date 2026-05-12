import { database } from '../../../client'
import {
  EvaluationResultValue,
  EvaluationType,
  LlmEvaluationMetric,
  LlmEvaluationCustomLabeledSpecification as specification,
} from '../../../constants'
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
  // Safe: the Custom validator only reads `configuration`. The cast is
  // needed because `evaluation.metric` is the literal `CustomLabeled`, which
  // isn't assignable to the inner signature's `Custom`.
  return await LlmEvaluationCustomSpecification.validate(
    { ...rest } as unknown as EvaluationMetricValidateArgs<
      EvaluationType.Llm,
      LlmEvaluationMetric.Custom
    >,
    db,
  )
}

async function run(
  {
    expectedOutput,
    ...rest
  }: EvaluationMetricRunArgs<
    EvaluationType.Llm,
    LlmEvaluationMetric.CustomLabeled
  >,
  db = database,
) {
  if (expectedOutput?.error) {
    throw expectedOutput.error
  } else if (expectedOutput?.value === undefined) {
    throw new BadRequestError('Expected output is required')
  }

  const result = (await LlmEvaluationCustomSpecification.run(
    { expectedOutput, ...rest } as unknown as EvaluationMetricRunArgs<
      EvaluationType.Llm,
      LlmEvaluationMetric.Custom
    >,
    db,
  )) as EvaluationResultValue<EvaluationType.Llm, LlmEvaluationMetric.Custom>

  return !result.error
    ? {
        ...result,
        metadata: {
          ...result.metadata,
          expectedOutput: expectedOutput?.value,
        },
      }
    : result
}
