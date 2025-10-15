import { EvaluationMetric, EvaluationType, EvaluationV2 } from '../../constants'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  DocumentVersionsRepository,
  EvaluationsV2Repository,
} from '../../repositories'
import { type Commit } from '../../schema/models/types/Commit'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createEvaluationV2 } from './create'
import { EVALUATION_SPECIFICATIONS } from './specifications'

export async function cloneEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    commit,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    commit: Commit
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (db) => {
    const documentsRepository = new DocumentVersionsRepository(workspace.id, db)
    const document = await documentsRepository
      .getDocumentAtCommit({
        commitUuid: commit.uuid,
        documentUuid: evaluation.documentUuid,
      })
      .then((r) => r.unwrap())

    const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
    if (!typeSpecification) {
      return Result.error(new BadRequestError('Invalid evaluation type'))
    }

    if (!typeSpecification.clone) {
      return Result.error(
        new BadRequestError('Cloning is not supported for this evaluation'),
      )
    }

    const settings = await typeSpecification
      .clone(
        {
          metric: evaluation.metric,
          evaluation: evaluation,
          document: document,
          commit: commit,
          workspace: workspace,
        },
        db,
      )
      .then((r) => r.unwrap())

    const evaluationsRepository = new EvaluationsV2Repository(workspace.id, db)
    const evaluations = await evaluationsRepository
      .listAtCommitByDocument({
        commitUuid: commit.uuid,
        documentUuid: evaluation.documentUuid,
      })
      .then((r) => r.unwrap())

    const existing = evaluations.filter(({ name }) =>
      name.startsWith(evaluation.name),
    ).length

    const { evaluation: clonedEvaluation } = await createEvaluationV2(
      {
        document: document,
        commit: commit,
        settings: {
          ...evaluation,
          ...settings,
          name: `${evaluation.name} (${existing})`,
        },
        options: {
          ...evaluation,
          evaluateLiveLogs:
            // @ts-expect-error seems TypeScript is not able to infer the type
            !!EVALUATION_SPECIFICATIONS[settings.type].metrics[settings.metric]
              .supportsLiveEvaluation,
        },
        workspace: workspace,
      },
      transaction,
    ).then((r) => r.unwrap())

    return Result.ok({ evaluation: clonedEvaluation })
  })
}
