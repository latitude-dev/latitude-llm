import {
  ChangedTrigger,
  DocumentTriggerStatus,
  ModifiedDocumentType,
} from '@latitude-data/constants'
import { Commit, DocumentTrigger, Workspace } from '../../../browser'
import { Result } from '../../../lib/Result'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import {
  CommitsRepository,
  DocumentTriggersRepository,
} from '../../../repositories'

async function getDraftTriggerChanges(
  { workspace, draft }: { workspace: Workspace; draft: Commit },
  transaction = new Transaction(),
): PromisedResult<ChangedTrigger[]> {
  return transaction.call(async (tx) => {
    const triggersRepository = new DocumentTriggersRepository(workspace.id, tx)

    const currentCommitTriggers =
      await triggersRepository.getTriggerUpdatesInDraft(draft)

    if (currentCommitTriggers.error) {
      return Result.error(currentCommitTriggers.error)
    }

    // For draft changes, we compare against the head triggers
    const headTriggers =
      await triggersRepository.getAllActiveTriggersInWorkspace()
    if (headTriggers.error) {
      return Result.error(headTriggers.error)
    }

    return Result.ok(
      triggerChangesPresenter({
        currentCommitTriggers: currentCommitTriggers.value,
        previousCommitTriggers: headTriggers.value,
      }),
    )
  })
}

function getChangeType(
  changedTrigger: DocumentTrigger,
  previousCommitTriggers: DocumentTrigger[],
): ModifiedDocumentType {
  const previousTrigger = previousCommitTriggers.find(
    (trigger) => trigger.uuid === changedTrigger.uuid,
  )

  if (!previousTrigger) {
    return ModifiedDocumentType.Created
  }

  if (changedTrigger.deletedAt) {
    return ModifiedDocumentType.Deleted
  }

  return ModifiedDocumentType.Updated
}

export function triggerChangesPresenter({
  currentCommitTriggers,
  previousCommitTriggers,
}: {
  currentCommitTriggers: DocumentTrigger[]
  previousCommitTriggers: DocumentTrigger[]
}) {
  const changes = currentCommitTriggers.map((changedTrigger) => {
    return {
      triggerUuid: changedTrigger.uuid,
      documentUuid: changedTrigger.documentUuid,
      triggerType: changedTrigger.triggerType,
      changeType: getChangeType(changedTrigger, previousCommitTriggers),
      status: changedTrigger.triggerStatus as DocumentTriggerStatus,
    } satisfies ChangedTrigger
  })

  // Sort by status (pending triggers first)
  return changes.sort((a, b) => {
    const aIsPending = a.status === DocumentTriggerStatus.Pending ? 1 : 0
    const bIsPending = b.status === DocumentTriggerStatus.Pending ? 1 : 0
    return bIsPending - aIsPending
  })
}

export async function getCommitTriggerChanges(
  { workspace, commit }: { workspace: Workspace; commit: Commit },
  transaction = new Transaction(),
): PromisedResult<ChangedTrigger[]> {
  return transaction.call(async (tx) => {
    if (!commit.mergedAt) {
      return getDraftTriggerChanges({ workspace, draft: commit }, transaction)
    }

    const commitsRepository = new CommitsRepository(workspace.id, tx)
    const previousCommit = await commitsRepository.getPreviousCommit(commit)
    const triggersRepository = new DocumentTriggersRepository(workspace.id, tx)

    const currentCommitTriggers =
      await triggersRepository.getTriggerUpdatesInDraft(commit)
    if (currentCommitTriggers.error) {
      return Result.error(currentCommitTriggers.error)
    }

    const previousCommitTriggers = previousCommit
      ? await triggersRepository.getTriggersInProject({
          projectId: previousCommit.projectId,
          commit: previousCommit,
        })
      : Result.ok([])

    if (previousCommitTriggers.error) {
      return Result.error(previousCommitTriggers.error)
    }

    return Result.ok(
      triggerChangesPresenter({
        currentCommitTriggers: currentCommitTriggers.value,
        previousCommitTriggers: previousCommitTriggers.value,
      }),
    )
  })
}
