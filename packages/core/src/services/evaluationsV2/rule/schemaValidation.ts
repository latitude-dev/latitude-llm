import Ajv from 'ajv'
import { database } from '../../../client'
import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSchemaValidationResultMetadata,
  RuleEvaluationSchemaValidationSpecification as specification,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'

export const RuleEvaluationSchemaValidationSpecification = {
  ...specification,
  validate: validate,
  run: run,
}

async function validate(
  {
    configuration,
  }: EvaluationMetricValidateArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.SchemaValidation
  >,
  _ = database,
) {
  configuration.schema = configuration.schema.trim()
  if (!configuration.schema) {
    return Result.error(new BadRequestError('Schema is required'))
  }

  try {
    switch (configuration.format) {
      case 'json':
        {
          const ajv = new Ajv({
            strict: true,
            strictSchema: true,
            validateSchema: true,
            allErrors: true,
          })

          ajv.compile(JSON.parse(configuration.schema))
          if (ajv.errors?.length) {
            return Result.error(
              new BadRequestError(ajv.errors.map((e) => e.message).join('. ')),
            )
          }
        }
        break
      default:
        return Result.error(new BadRequestError('Invalid schema format'))
    }
  } catch (error) {
    return Result.error(new BadRequestError((error as Error).message))
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    reverseScale: configuration.reverseScale,
    actualOutput: configuration.actualOutput,
    expectedOutput: configuration.expectedOutput,
    format: configuration.format,
    schema: configuration.schema,
  })
}

function grade({
  score,
  metadata,
}: {
  score: number
  metadata: RuleEvaluationSchemaValidationResultMetadata
}) {
  let normalizedScore = normalizeScore(score, 0, 1)
  let hasPassed = score === 1
  if (metadata.configuration.reverseScale) {
    normalizedScore = normalizeScore(score, 1, 0)
    hasPassed = score === 0
  }

  return { score, normalizedScore, metadata, hasPassed }
}

async function run(
  {
    evaluation,
    actualOutput,
    customReason,
    datasetReason,
  }: EvaluationMetricRunArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.SchemaValidation
  >,
  _ = database,
) {
  const metadata = {
    configuration: evaluation.configuration,
    actualOutput: actualOutput.value ?? '',
    customReason: customReason,
    datasetReason: datasetReason,
  } as RuleEvaluationSchemaValidationResultMetadata

  if (actualOutput.error) {
    metadata.reason = actualOutput.error.message
    return grade({ score: 0, metadata })
  }

  let score = 0

  switch (metadata.configuration.format) {
    case 'json':
      {
        const ajv = new Ajv({
          strict: true,
          strictSchema: true,
          validateSchema: true,
          allErrors: true,
        })

        const validate = ajv.compile(JSON.parse(metadata.configuration.schema))
        if (ajv.errors?.length) {
          throw new Error(ajv.errors.map((e) => e.message).join('. '))
        }

        try {
          const result = validate(JSON.parse(metadata.actualOutput))
          if (!result) {
            throw new Error(validate.errors!.map((e) => e.message).join('. '))
          }

          score = 1
        } catch (error) {
          score = 0
          metadata.reason = (error as Error).message
        }
      }
      break
    default:
      throw new Error('Invalid schema format')
  }

  return grade({ score, metadata })
}
