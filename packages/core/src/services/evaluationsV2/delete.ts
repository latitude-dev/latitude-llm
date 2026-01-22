import { eq } from 'drizzle-orm'
import { EvaluationMetric, EvaluationType, EvaluationV2 } from '../../constants'
import { publisher } from '../../events/publisher'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  DocumentVersionsRepository,
  EvaluationsV2Repository,
} from '../../repositories'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { type Workspace } from '../../schema/models/types/Workspace'
import { syncDefaultCompositeTarget } from './sync'

export async function deleteEvaluationV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
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
): Promise<TypedResult<{ evaluation: EvaluationV2<T, M> }>> {
  return await transaction.call(async (tx) => {
    const repository = new EvaluationsV2Repository(workspace.id, tx)
    const existsAnotherVersion = await repository
      .existsAnotherVersion({
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
      })
      .then((r) => r.unwrap())

    if (existsAnotherVersion) {
      const result = await tx
        .insert(evaluationVersions)
        .values({
          ...evaluation,
          id: undefined,
          commitId: commit.id,
          deletedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            evaluationVersions.commitId,
            evaluationVersions.evaluationUuid,
          ],
          set: { deletedAt: new Date() },
        })
        .returning()
        .then((r) => r[0]!)

      evaluation = {
        ...result,
        uuid: result.evaluationUuid,
        versionId: result.id,
      } as unknown as EvaluationV2<T, M>
    } else {
      await tx
        .delete(evaluationVersions)
        .where(eq(evaluationVersions.id, evaluation.versionId))

      evaluation.deletedAt = new Date()
    }

    if (evaluation.issueId) {
      const documentsRepository = new DocumentVersionsRepository(
        workspace.id,
        tx,
      )
      const document = await documentsRepository
        .getDocumentAtCommit({
          commitUuid: commit.uuid,
          documentUuid: evaluation.documentUuid,
        })
        .then((r) => r.unwrap())

      // Note: if the deleted evaluation had an issue linked,
      // we treat it as if the issue was being unlinked
      await syncDefaultCompositeTarget(
        { document, commit, workspace },
        transaction,
      )
    }

    await publisher.publishLater({
      type: 'evaluationV2Deleted',
      data: {
        evaluation: evaluation,
        workspaceId: workspace.id,
      },
    })

    return Result.ok({ evaluation })
  })
}
