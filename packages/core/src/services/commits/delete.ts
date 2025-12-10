import { eq } from 'drizzle-orm'
import pg from 'pg'
const { DatabaseError } = pg

import { type Commit } from '../../schema/models/types/Commit'
import { unsafelyFindCommitsByProjectId } from '../../data-access/commits'
import { BadRequestError, databaseErrorCodes } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { commits } from '../../schema/models/commits'
import { pingProjectUpdate } from '../projects'
import { findWorkspaceFromCommit } from '../../data-access/workspaces'
import { publisher } from '../../events/publisher'
import { captureException } from '../../utils/datadogCapture'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'

export async function deleteCommitDraft(
  commit: Commit,
  transaction = new Transaction(),
) {
  return transaction.call<Commit>(
    async (tx) => {
      const assertionResult = assertCommitIsDraft(commit)
      if (assertionResult.error) return assertionResult

      try {
        const projectCommits = await unsafelyFindCommitsByProjectId(
          commit.projectId,
          tx,
        )
        if (projectCommits.length === 1) {
          return Result.error(
            new BadRequestError('Cannot delete the only version in a project'),
          )
        }

        const deleted = await tx
          .update(commits)
          .set({ deletedAt: new Date() })
          .where(eq(commits.id, commit.id))
          .returning()

        const deletedCommit = deleted[0]!

        await pingProjectUpdate(
          {
            projectId: commit.projectId,
          },
          transaction,
        ).then((r) => r.unwrap())

        return Result.ok(deletedCommit)
      } catch (error) {
        if (
          error instanceof DatabaseError &&
          error.code === databaseErrorCodes.foreignKeyViolation
        ) {
          throw new BadRequestError(
            'Cannot delete this version because there are logs or evaluations associated with it.',
          )
        } else {
          throw error
        }
      }
    },
    async (deletedCommit) => {
      try {
        const workspace = await findWorkspaceFromCommit(deletedCommit)
        if (!workspace) {
          captureException(
            new Error(
              `Workspace not found for deleted commit ${deletedCommit.id}`,
            ),
          )
          return
        }

        await publisher.publishLater({
          type: 'commitDeleted',
          data: {
            commit: deletedCommit,
            workspaceId: workspace.id,
          },
        })
      } catch (error) {
        captureException(error as Error)
      }
    },
  )
}
