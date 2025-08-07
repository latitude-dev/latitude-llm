import {
  ACCESSIBLE_OUTPUT_FORMATS,
  type ActualOutputConfiguration,
  type Commit,
  type DocumentVersion,
  type EvaluationMetric,
  type EvaluationOptions,
  type EvaluationSettings,
  type EvaluationType,
  type EvaluationV2,
  type ExpectedOutputConfiguration,
  type Workspace,
} from '../../browser'
import { database } from '../../client'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { EvaluationsV2Repository } from '../../repositories'
import { EVALUATION_SPECIFICATIONS } from './specifications'

export async function validateEvaluationV2<T extends EvaluationType, M extends EvaluationMetric<T>>(
  {
    mode,
    evaluation,
    settings,
    options,
    document,
    commit,
    workspace,
  }: {
    mode: 'create' | 'update'
    evaluation?: EvaluationV2<T, M>
    settings: EvaluationSettings<T, M>
    options: EvaluationOptions
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  db = database,
) {
  if (mode === 'update' && !evaluation) {
    return Result.error(new BadRequestError('Evaluation is required to update from'))
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

  const parsing = typeSpecification.configuration.safeParse(settings.configuration)
  if (parsing.error) {
    return Result.error(parsing.error)
  }

  const actualOutputValidation = await validateActualOutput({
    mode: mode,
    configuration: settings.configuration.actualOutput,
  })
  if (actualOutputValidation.error) {
    return Result.error(actualOutputValidation.error)
  }
  settings.configuration.actualOutput = actualOutputValidation.value

  const expectedOutputValidation = await validateExpectedOutput({
    mode: mode,
    configuration: settings.configuration.expectedOutput,
  })
  if (expectedOutputValidation.error) {
    return Result.error(expectedOutputValidation.error)
  }
  settings.configuration.expectedOutput = expectedOutputValidation.value

  const typeMetricValidation = await typeSpecification.validate(
    {
      mode: mode,
      metric: settings.metric,
      configuration: settings.configuration,
      document: document,
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

  const repository = new EvaluationsV2Repository(workspace.id, db)
  const listing = await repository.listAtCommitByDocument({
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  })
  if (listing.error) {
    return Result.error(listing.error)
  }
  const evaluations = listing.value

  if (evaluations.find((e) => e.name === settings.name && e.uuid !== evaluation?.uuid)) {
    return Result.error(
      new BadRequestError('An evaluation with this name already exists for this document'),
    )
  }

  if (options.evaluateLiveLogs && !metricSpecification.supportsLiveEvaluation) {
    return Result.error(new BadRequestError('This metric does not support live evaluation'))
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

const FIELD_ACCESSOR_DEPTH_LIMIT = 10

async function validateActualOutput({
  configuration,
}: {
  mode: 'create' | 'update'
  configuration?: ActualOutputConfiguration
}) {
  if (!configuration) {
    configuration = {
      messageSelection: 'last',
      parsingFormat: 'string',
    }
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
    return Result.error(new BadRequestError('Field accessor is not supported for this format'))
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

async function validateExpectedOutput({
  configuration,
}: {
  mode: 'create' | 'update'
  configuration?: ExpectedOutputConfiguration
}) {
  if (!configuration) {
    configuration = {
      parsingFormat: 'string',
    }
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
    return Result.error(new BadRequestError('Field accessor is not supported for this format'))
  }

  // Note: all settings are explicitly returned to ensure we don't
  // carry dangling fields from the original settings object
  return Result.ok({
    parsingFormat: configuration.parsingFormat,
    fieldAccessor: configuration.fieldAccessor,
  })
}
