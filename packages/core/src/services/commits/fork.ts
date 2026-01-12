import { omit } from 'lodash-es'
import { type Commit } from '../../schema/models/types/Commit'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  DocumentVersionsRepository,
  EvaluationsV2Repository,
} from '../../repositories'
import { documentVersions } from '../../schema/models/documentVersions'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { inheritDocumentRelations } from '../documents/inheritRelations'
import { createCommit } from './create'

/**
 * Creates a new draft commit by forking from an existing commit.
 * Copies only the changes (documents and evaluations directly in the source commit)
 * to the new commit. Inherited items from merged history are not copied as they
 * will be visible via the versioning system.
 */
export async function forkCommit(
  {
    commit,
    workspace,
    project,
    user,
    data: { title, description },
  }: {
    commit: Commit
    workspace: Workspace
    project: Project
    user: User
    data: {
      title: string
      description?: string
    }
  },
  transaction = new Transaction(),
) {
  return transaction.call<Commit>(async (tx) => {
    const newCommit = await createCommit(
      {
        project,
        user,
        baseCommit: commit,
        data: { title, description },
      },
      transaction,
    ).then((r) => r.unwrap())

    const docsRepo = new DocumentVersionsRepository(workspace.id, tx)
    const documents = await docsRepo
      .listCommitChanges(commit)
      .then((r) => r.unwrap())

    if (documents.length > 0) {
      const insertedDocs = await tx
        .insert(documentVersions)
        .values(
          documents.map((d) => ({
            ...omit(d, ['id', 'commitId', 'updatedAt', 'createdAt']),
            commitId: newCommit.id,
          })),
        )
        .returning()

      await Promise.all(
        insertedDocs.map(async (toVersion) => {
          const fromVersion = documents.find(
            (d) => d.documentUuid === toVersion.documentUuid,
          )!
          return inheritDocumentRelations(
            { fromVersion, toVersion, workspace },
            transaction,
          ).then((r) => r.unwrap())
        }),
      )
    }

    const evalsRepo = new EvaluationsV2Repository(workspace.id, tx)
    const evaluations = await evalsRepo
      .getChangesInCommit(commit)
      .then((r) => r.unwrap())

    if (evaluations.length > 0) {
      const evalValues = evaluations.map((e) => ({
        ...omit(e, [
          'id',
          'versionId',
          'uuid',
          'commitId',
          'updatedAt',
          'createdAt',
        ]),
        commitId: newCommit.id,
      })) as (typeof evaluationVersions.$inferInsert)[]

      await tx.insert(evaluationVersions).values(evalValues)
    }

    return Result.ok(newCommit)
  })
}
