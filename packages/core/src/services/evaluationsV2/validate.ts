import {
  Commit,
  DocumentVersion,
  EVALUATION_SCORE_SCALE,
  EvaluationCondition,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { BadRequestError, Result } from '../../lib'
import { EvaluationsV2Repository } from '../../repositories'
import { EVALUATION_SPECIFICATIONS } from './shared'

export async function validateEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    document,
    commit,
    settings,
    options,
    workspace,
  }: {
    evaluation?: EvaluationV2<T, M>
    document?: DocumentVersion
    commit: Commit
    settings: EvaluationSettings<T, M>
    options: EvaluationOptions
    workspace: Workspace
  },
  db: Database = database,
) {
  const specification = EVALUATION_SPECIFICATIONS[settings.type]
  if (!specification) {
    return Result.error(new BadRequestError('Invalid type'))
  }

  specification.configuration.parse(settings.configuration)

  settings.configuration = await specification
    .validate(
      {
        metric: settings.metric,
        configuration: settings.configuration,
      },
      db,
    )
    .then((r) => r.unwrap())

  if (!settings.name) {
    return Result.error(new BadRequestError('Name is required'))
  }

  if (!Object.values(EvaluationCondition).includes(settings.condition)) {
    return Result.error(new BadRequestError('Invalid pass condition'))
  }

  if (settings.threshold < 0 || settings.threshold > EVALUATION_SCORE_SCALE) {
    return Result.error(
      new BadRequestError(
        `Threshold must be between 0 and ${EVALUATION_SCORE_SCALE}`,
      ),
    )
  }

  const repository = new EvaluationsV2Repository(workspace.id, db)
  const evaluations = await repository
    .listAtCommitByDocument({
      commitUuid: commit.uuid,
      documentUuid: (document?.documentUuid || evaluation?.documentUuid)!,
    })
    .then((r) => r.unwrap())
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

  // Note: all settings and options are explicitly returned to ensure we don't
  // carry dangling fields from the original settings and options object
  return Result.ok({
    settings: {
      name: settings.name,
      description: settings.description,
      type: settings.type,
      metric: settings.metric,
      condition: settings.condition,
      threshold: settings.threshold,
      configuration: settings.configuration,
    },
    options: {
      live: options.live,
      enableSuggestions: options.enableSuggestions,
      autoApplySuggestions: options.autoApplySuggestions,
    },
  })
}
