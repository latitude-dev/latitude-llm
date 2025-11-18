import { z } from 'zod'
import { database } from '../../client'
import {
  ACCESSIBLE_OUTPUT_FORMATS,
  ActualOutputConfiguration,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  ExpectedOutputConfiguration,
} from '../../constants'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { EvaluationsV2Repository } from '../../repositories'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Issue } from '../../schema/models/types/Issue'
import { type Workspace } from '../../schema/models/types/Workspace'
import { EvaluationMetricBackendSpecification } from './shared'
import { EVALUATION_SPECIFICATIONS } from './specifications'

export async function validateEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    mode,
    evaluation,
    settings,
    options,
    document,
    commit,
    workspace,
    issue,
  }: {
    mode: 'create' | 'update'
    evaluation?: EvaluationV2<T, M>
    settings: EvaluationSettings<T, M>
    options: EvaluationOptions
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
    issue: Issue | null
  },
  db = database,
) {
  const repository = new EvaluationsV2Repository(workspace.id, db)
  const listing = await repository.listAtCommitByDocument({
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  })
  if (listing.error) {
    return Result.error(listing.error)
  }
  const evaluations = listing.value.filter((e) => e.uuid !== evaluation?.uuid)

  if (mode === 'update' && !evaluation) {
    return Result.error(
      new BadRequestError('Evaluation is required to update from'),
    )
  }

  settings.name = settings.name.trim()
  if (!settings.name) {
    return Result.error(new BadRequestError('Name is required'))
  }

  settings.description = settings.description.trim()

  const typeSpecification = EVALUATION_SPECIFICATIONS[settings.type]
  if (!typeSpecification) {
    return Result.error(new BadRequestError('Invalid type'))
  }

  const metricSpecification = typeSpecification.metrics[settings.metric]

  if (!metricSpecification) {
    return Result.error(new BadRequestError('Invalid metric'))
  }

  const parsing = typeSpecification.configuration.safeParse(
    settings.configuration,
  )

  if (parsing.error) {
    return Result.error(parsing.error)
  }

  const actualOutputValidation = await validateActualOutput({
    mode: mode,
    specification: metricSpecification,
    configuration: settings.configuration.actualOutput,
  })
  if (actualOutputValidation.error) {
    return Result.error(actualOutputValidation.error)
  }
  settings.configuration.actualOutput = actualOutputValidation.value

  const expectedOutputValidation = await validateExpectedOutput({
    mode: mode,
    specification: metricSpecification,
    configuration: settings.configuration.expectedOutput,
  })
  if (expectedOutputValidation.error) {
    return Result.error(expectedOutputValidation.error)
  }
  settings.configuration.expectedOutput = expectedOutputValidation.value

  const typeMetricValidation = await typeSpecification.validate(
    {
      mode: mode,
      uuid: evaluation?.uuid,
      metric: settings.metric,
      configuration: settings.configuration,
      document: document,
      evaluations: evaluations,
      commit: commit,
      workspace: workspace,
    },
    db,
  )
  if (typeMetricValidation.error) {
    return Result.error(typeMetricValidation.error)
  }
  settings.configuration = {
    ...typeMetricValidation.value,
    reverseScale: settings.configuration.reverseScale,
    actualOutput: settings.configuration.actualOutput,
    expectedOutput: settings.configuration.expectedOutput,
  }

  if (evaluations.find((e) => e.name === settings.name)) {
    return Result.error(
      new z.ZodError([
        {
          code: 'custom',
          path: ['name'],
          message:
            'An evaluation with this name already exists for this document',
        },
      ]),
    )
  }

  if (options.evaluateLiveLogs && !metricSpecification.supportsLiveEvaluation) {
    return Result.error(
      new BadRequestError('This metric does not support live evaluation'),
    )
  }

  // ISSUE VALIDATIONS
  if (metricSpecification.requiresExpectedOutput && issue) {
    return Result.error(
      new BadRequestError(
        'Cannot link an evaluation to an issue with expected output',
      ),
    )
  }

  if (issue && issue.mergedAt) {
    return Result.error(
      new BadRequestError('Cannot use an issue that has been merged'),
    )
  }

  if (issue && issue.resolvedAt) {
    return Result.error(
      new BadRequestError('Cannot use an issue that has been resolved'),
    )
  }

  if (issue && issue.ignoredAt) {
    return Result.error(
      new BadRequestError('Cannot use an issue that has been ignored'),
    )
  }

  // Note: all settings and options are explicitly returned to ensure we don't
  // carry dangling fields from the original settings and options object
  return Result.ok({
    settings: {
      name: settings.name,
      description: settings.description,
      type: settings.type,
      metric: settings.metric,
      configuration: settings.configuration,
    },
    options: {
      evaluateLiveLogs: options.evaluateLiveLogs,
      enableSuggestions: options.enableSuggestions,
      autoApplySuggestions: options.autoApplySuggestions,
    },
  })
}

const FIELD_ACCESSOR_DEPTH_LIMIT = 25

async function validateActualOutput<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  configuration,
}: {
  mode: 'create' | 'update'
  specification: EvaluationMetricBackendSpecification<T, M>
  configuration: ActualOutputConfiguration
}) {
  if (!configuration) {
    return Result.error(
      new BadRequestError('Actual output configuration is required'),
    )
  }

  configuration.fieldAccessor = configuration.fieldAccessor?.trim()
  if (
    ACCESSIBLE_OUTPUT_FORMATS.includes(configuration.parsingFormat) &&
    configuration.fieldAccessor
  ) {
    let depth = 0
    for (let i = 0; i < configuration.fieldAccessor.length; i++) {
      const c = configuration.fieldAccessor[i]
      if (c === '.' || c === '[') depth++
    }

    if (depth > FIELD_ACCESSOR_DEPTH_LIMIT) {
      return Result.error(new BadRequestError('Field accessor is too complex'))
    }
  } else if (configuration.fieldAccessor) {
    return Result.error(
      new BadRequestError('Field accessor is not supported for this format'),
    )
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    messageSelection: configuration.messageSelection,
    contentFilter: configuration.contentFilter,
    parsingFormat: configuration.parsingFormat,
    fieldAccessor: configuration.fieldAccessor,
  })
}

async function validateExpectedOutput<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  specification,
  configuration,
}: {
  mode: 'create' | 'update'
  specification: EvaluationMetricBackendSpecification<T, M>
  configuration?: ExpectedOutputConfiguration
}) {
  if (!configuration) {
    if (specification.requiresExpectedOutput) {
      return Result.error(
        new BadRequestError(
          'Expected output configuration is required for this metric',
        ),
      )
    }

    return Result.nil()
  }

  configuration.fieldAccessor = configuration.fieldAccessor?.trim()
  if (
    ACCESSIBLE_OUTPUT_FORMATS.includes(configuration.parsingFormat) &&
    configuration.fieldAccessor
  ) {
    let depth = 0
    for (let i = 0; i < configuration.fieldAccessor.length; i++) {
      const c = configuration.fieldAccessor[i]
      if (c === '.' || c === '[') depth++
    }

    if (depth > FIELD_ACCESSOR_DEPTH_LIMIT) {
      return Result.error(new BadRequestError('Field accessor is too complex'))
    }
  } else if (configuration.fieldAccessor) {
    return Result.error(
      new BadRequestError('Field accessor is not supported for this format'),
    )
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    parsingFormat: configuration.parsingFormat,
    fieldAccessor: configuration.fieldAccessor,
  })
}
