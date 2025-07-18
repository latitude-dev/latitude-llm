import {
  DocumentVersion,
  LatteThreadCheckpoint,
  Workspace,
} from '../../../../../browser'
import { Result } from '../../../../../lib/Result'
import Transaction, { PromisedResult } from '../../../../../lib/Transaction'
import { LatteThreadsRepository } from '../../../../../repositories'
import { documentVersions } from '../../../../../schema'
import { and, eq } from 'drizzle-orm'
import { clearLatteThreadCheckpoints } from './clearCheckpoints'

export async function undoLatteThreadChanges(
  {
    workspace,
    threadUuid,
  }: {
    workspace: Workspace
    threadUuid: string
  },
  transaction = new Transaction(),
): PromisedResult<undefined> {
  return transaction.call(async (tx) => {
    const threadsScope = new LatteThreadsRepository(workspace.id, tx)
    const checkpoints = await threadsScope
      .findAllCheckpoints(threadUuid)
      .then((r) => r.unwrap())

    for await (const checkpoint of checkpoints) {
      const restoreResult = await restoreThreadCheckpoint(
        checkpoint,
        transaction,
      )

      if (!restoreResult.ok) {
        return Result.error(restoreResult.error!)
      }
    }

    const result = await clearLatteThreadCheckpoints({
      threadUuid,
      workspaceId: workspace.id,
    })

    return result
  })
}

function restoreThreadCheckpoint(
  checkpoint: LatteThreadCheckpoint,
  transaction = new Transaction(),
): PromisedResult<DocumentVersion | undefined> {
  return transaction.call<DocumentVersion | undefined>(async (tx) => {
    if (!checkpoint.data) {
      // This document has been created in this draft. To restore the checkpoint, we must remove it.
      // Since there is no previous version of this document, we can safely hard-delete the documentVersion.
      const uncreatedResults = await tx
        .delete(documentVersions)
        .where(
          and(
            eq(documentVersions.documentUuid, checkpoint.documentUuid),
            eq(documentVersions.commitId, checkpoint.commitId),
          ),
        )
        .returning()
      return Result.ok(uncreatedResults[0])
    }

    if (checkpoint.data.commitId !== checkpoint.commitId) {
      // The document to restore is the state of the document in a later commit,
      // so we can just remove the current documentVersion changes to restore the checkpoint
      const deletedResults = await tx
        .delete(documentVersions)
        .where(
          and(
            eq(documentVersions.documentUuid, checkpoint.documentUuid),
            eq(documentVersions.commitId, checkpoint.commitId),
          ),
        )
        .returning()
      return Result.ok(deletedResults[0])
    }

    // We must upsert the documentVersion to restore the checkpoint
    const values = {
      documentUuid: checkpoint.data.documentUuid,
      commitId: checkpoint.data.commitId,
      path: checkpoint.data.path,
      content: checkpoint.data.content,
      deletedAt: checkpoint.data.deletedAt
        ? new Date(checkpoint.data.deletedAt)
        : null,
      resolvedContent: null,
      contentHash: null,
    }
    const upsertResult = await tx
      .insert(documentVersions)
      .values(values)
      .onConflictDoUpdate({
        target: [documentVersions.documentUuid, documentVersions.commitId],
        set: values,
      })
      .returning()
    return Result.ok(upsertResult[0])
  })
}
