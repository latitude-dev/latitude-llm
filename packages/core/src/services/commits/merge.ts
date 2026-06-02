import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import { ModifiedDocumentType } from '@latitude-data/constants'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { findWorkspaceFromCommit } from '../../data-access/workspaces'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  LatitudeError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../lib/errors'
import { commits } from '../../schema/models/commits'
import { computeChanges, recomputeChanges } from '../documents'
import { pingProjectUpdate } from '../projects'
import { handleTriggerMerge } from '../documentTriggers/handleMerge'
import {
  DocumentTriggersRepository,
  EvaluationsV2Repository,
} from '../../repositories'
import { publisher } from '../../events/publisher'
import { findUser } from '../users/data-access/find'
import { changesPresenter } from './getChanges'
import { CommitPublishedDocumentChange } from '../../events/events'
import { captureException } from '../../utils/datadogCapture'

type ValidationResult = {
  workspace: Workspace
}

/**
 * Projects the post-merge active state of the project's documents and rejects
 * the merge when two distinct documentUuids would share the same path.
 *
 * Without this check, two drafts that each add a new document at the same path
 * can both merge independently (the `(path, commit_id, deleted_at)` unique
 * constraint only enforces uniqueness within a single commit), leaving LIVE
 * with two active rows at the same path. Path-based lookups then become
 * non-deterministic.
 */
function detectDuplicatePathConflicts({
  headDocuments,
  changedDocuments,
  commitId,
}: {
  headDocuments: DocumentVersion[]
  changedDocuments: DocumentVersion[]
  commitId: number
}) {
  const changedUuids = new Set(changedDocuments.map((d) => d.documentUuid))
  const projectedDocuments = [
    ...headDocuments.filter((d) => !changedUuids.has(d.documentUuid)),
    ...changedDocuments,
  ]

  const pathToUuids = new Map<string, Set<string>>()
  for (const doc of projectedDocuments) {
    if (doc.deletedAt) continue
    const existing = pathToUuids.get(doc.path) ?? new Set<string>()
    existing.add(doc.documentUuid)
    pathToUuids.set(doc.path, existing)
  }

  const conflictingPaths = [...pathToUuids.entries()]
    .filter(([, uuids]) => uuids.size > 1)
    .map(([path]) => path)

  if (conflictingPaths.length === 0) return Result.nil()

  const message = `Cannot publish: the following paths would have more than one active document after merging: ${conflictingPaths
    .map((p) => `'${p}'`)
    .join(
      ', ',
    )}. Please rename or delete the conflicting documents before publishing.`

  return Result.error(
    new UnprocessableEntityError(message, {
      [commitId]: [message],
    }),
  )
}

export async function mergeCommit(
  commit: Commit,
  transaction = new Transaction(),
) {
  const mergedAt = new Date()

  // Phase 1: requirements validation in a short transaction
  const validationResult = await transaction.call<ValidationResult>(
    async (tx) => {
      const otherCommits = await tx
        .select()
        .from(commits)
        .where(
          and(
            isNull(commits.deletedAt),
            eq(commits.projectId, commit.projectId),
            eq(commits.mergedAt, mergedAt),
          ),
        )
      if (otherCommits.length > 0) {
        return Result.error(
          new LatitudeError(
            'Commit publish the version time conflict, try again',
          ),
        )
      }

      const workspace = await findWorkspaceFromCommit(commit, tx)
      if (!workspace) {
        return Result.error(new NotFoundError('Workspace not found'))
      }

      // Validate against an in-memory computation only. The actual snapshot is
      // materialized later, inside the locked phase, against the then-current
      // head (see phase 3) so a parallel publish is never reverted.
      const recomputedResults = await computeChanges(
        { draft: commit, workspace },
        transaction,
      )
      if (recomputedResults.error) return recomputedResults
      const { changedDocuments, headDocuments, mainDocumentChanged } =
        recomputedResults.unwrap()

      if (Object.keys(recomputedResults.value.errors).length > 0) {
        return Result.error(
          new UnprocessableEntityError(
            'There are errors in the updated documents in this version',
            {
              [commit.id]: [
                'There are errors in the updated documents in this version',
              ],
            },
          ),
        )
      }

      const pathConflictResult = detectDuplicatePathConflicts({
        headDocuments,
        changedDocuments,
        commitId: commit.id,
      })
      if (!Result.isOk(pathConflictResult)) return pathConflictResult

      const evaluationsScope = new EvaluationsV2Repository(workspace.id, tx)
      const evaluationChangesResult =
        await evaluationsScope.getChangesInCommit(commit)
      if (!Result.isOk(evaluationChangesResult)) return evaluationChangesResult

      const evaluationChanges = evaluationChangesResult.unwrap()

      const triggersScope = new DocumentTriggersRepository(workspace.id, tx)
      const triggerChangesResult =
        await triggersScope.getTriggerUpdatesInDraft(commit)

      if (!Result.isOk(triggerChangesResult)) return triggerChangesResult

      const triggerChanges = triggerChangesResult.unwrap()

      const totalChanges =
        evaluationChanges.length +
        triggerChanges.length +
        changedDocuments.length

      if (totalChanges === 0 && !mainDocumentChanged) {
        return Result.error(
          new UnprocessableEntityError(
            'Cannot publish a version with no changes.',
            {
              [commit.id]: ['Cannot publish a version with no changes.'],
            },
          ),
        )
      }

      return Result.ok({ workspace })
    },
  )

  if (!Result.isOk(validationResult)) return validationResult

  const { workspace } = validationResult.unwrap()

  // Phase 2: handle trigger merge outside of any active transaction
  const handleTriggerMergeResult = await handleTriggerMerge(
    {
      workspace,
      draft: commit,
    },
    transaction,
  )

  if (!Result.isOk(handleTriggerMergeResult)) return handleTriggerMergeResult

  // Computed inside the locked phase below from the freshly materialized state.
  let documentChanges: CommitPublishedDocumentChange[] = []

  // Phase 3: finalize merge in a new short transaction
  return transaction.call<Commit>(
    async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${sql.raw(String(commit.projectId))})`,
      )

      // Materialize the draft's changes against the current head while holding
      // the project lock. Reference-only parents are snapshotted from the latest
      // Live content, so a version published in parallel since validation is not
      // reverted.
      const recomputed = await recomputeChanges(
        { draft: commit, workspace },
        transaction,
      )
      if (recomputed.error) return recomputed

      documentChanges = changesPresenter({
        currentCommitChanges: recomputed.value.changedDocuments,
        previousCommitDocuments: recomputed.value.headDocuments,
        errors: {},
      }).map((doc) => ({
        path: doc.path,
        // The published-changes event is a public contract (webhooks). Collapse
        // the UI-only `UpdatedByReference` back to `Updated` so consumers keep
        // seeing the existing set of change types.
        changeType:
          doc.changeType === ModifiedDocumentType.UpdatedByReference
            ? ModifiedDocumentType.Updated
            : doc.changeType,
      }))

      const lastMergedCommit = await tx
        .select()
        .from(commits)
        .where(
          and(
            isNotNull(commits.version),
            eq(commits.projectId, commit.projectId),
          ),
        )
        .orderBy(desc(commits.version))
        .limit(1)
        .then((rows) => rows[0])
      const version = (lastMergedCommit?.version ?? 0) + 1
      const result = await tx
        .update(commits)
        .set({ mergedAt, version })
        .where(eq(commits.id, commit.id))
        .returning()
      const updatedCommit = result[0]!

      return Result.ok(updatedCommit)
    },
    async (commit) => {
      try {
        const user = await findUser(commit.userId)

        if (!user) return

        await Promise.all([
          publisher.publishLater({
            type: 'commitMerged',
            data: {
              commit,
              userEmail: user.email,
              workspaceId: workspace.id,
            },
          }),

          publisher.publishLater({
            type: 'commitPublished',
            data: {
              commit,
              userEmail: user.email,
              workspaceId: workspace.id,
              changedDocuments: documentChanges,
            },
          }),

          pingProjectUpdate(
            {
              projectId: commit.projectId,
            },
            transaction,
          ).then((r) => r.unwrap()),
        ])
      } catch (error) {
        captureException(error as Error)
      }
    },
  )
}
