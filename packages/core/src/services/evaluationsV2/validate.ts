import {
  Commit,
  DocumentVersion,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { EvaluationsV2Repository } from '../../repositories'
import { EVALUATION_SPECIFICATIONS } from './specifications'

export async function validateEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    settings,
    options,
    document,
    commit,
    workspace,
  }: {
    evaluation?: EvaluationV2<T, M>
    settings: EvaluationSettings<T, M>
    options: EvaluationOptions
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  db: Database = database,
) {
  if (!settings.name) {
    return Result.error(new BadRequestError('Name is required'))
  }

  const typeSpecification = EVALUATION_SPECIFICATIONS[settings.type]
  if (!typeSpecification) {
    return Result.error(new BadRequestError('Invalid type'))
  }

  const metricSpecification = typeSpecification.metrics[settings.metric]
  if (!metricSpecification) {
    return Result.error(new BadRequestError('Invalid metric'))
  }

  typeSpecification.configuration.parse(settings.configuration)

  const validationResult = await typeSpecification.validate(
    {
      metric: settings.metric,
      configuration: settings.configuration,
      document: document,
      commit: commit,
      workspace: workspace,
    },
    db,
  )
  if (validationResult.error) return validationResult

  settings.configuration = validationResult.value

  const repository = new EvaluationsV2Repository(workspace.id, db)
  const evaluationsResult = await repository.listAtCommitByDocument({
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  })
  if (evaluationsResult.error) return evaluationsResult

  const evaluations = evaluationsResult.value
  if (
    evaluations.find(
      (e) => e.name === settings.name && e.uuid !== evaluation?.uuid,
    )
  ) {
    return Result.error(
      new BadRequestError(
        'An evaluation with this name already exists for this document',
      ),
    )
  }

  if (options.evaluateLiveLogs && !metricSpecification.supportsLiveEvaluation) {
    return Result.error(
      new BadRequestError('This metric does not support live evaluation'),
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
