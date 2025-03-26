import Ajv from 'ajv'
import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSchemaValidationSpecification,
} from '../../../browser'
import { database, Database } from '../../../client'
import { BadRequestError, Result } from '../../../lib'
import {
  EvaluationMetricRunArgs,
  EvaluationMetricValidateArgs,
  normalizeScore,
} from '../shared'

const specification = RuleEvaluationSchemaValidationSpecification
export default {
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
  _: Database = database,
) {
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
    format: configuration.format,
    schema: configuration.schema,
  })
}

async function run(
  {
    evaluation,
    actualOutput,
  }: EvaluationMetricRunArgs<
    EvaluationType.Rule,
    RuleEvaluationMetric.SchemaValidation
  >,
  _: Database = database,
) {
  try {
    let metadata = {
      configuration: evaluation.configuration,
      actualOutput: actualOutput,
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

          const validate = ajv.compile(
            JSON.parse(metadata.configuration.schema),
          )
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
          }
        }
        break
      default:
        throw new Error('Invalid schema format')
    }

    let normalizedScore = normalizeScore(score, 0, 1)
    let hasPassed = score === 1
    if (metadata.configuration.reverseScale) {
      normalizedScore = normalizeScore(score, 1, 0)
      hasPassed = score === 0
    }

    return { score, normalizedScore, metadata, hasPassed }
  } catch (error) {
    return { error: { message: (error as Error).message } }
  }
}
