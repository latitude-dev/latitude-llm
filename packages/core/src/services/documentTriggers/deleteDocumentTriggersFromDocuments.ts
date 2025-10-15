import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { DocumentTriggersRepository } from '../../repositories'
import { deleteDocumentTrigger } from './delete'

export async function deleteDocumentTriggersFromDocuments(
  {
    workspace,
    commit,
    documents,
  }: {
    workspace: Workspace
    commit: Commit
    documents: DocumentVersion[]
  },
  transaction = new Transaction(),
): PromisedResult<undefined> {
  return await transaction.call(async (tx) => {
    const documentTriggerScope = new DocumentTriggersRepository(
      workspace.id,
      tx,
    )

    const activeTriggersForDocumentsInCommitResult = await Promise.all(
      documents.map(async (document) => {
        return documentTriggerScope.getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit,
        })
      }),
    )

    if (Result.includesAnError(activeTriggersForDocumentsInCommitResult)) {
      return Result.findError(activeTriggersForDocumentsInCommitResult)!
    }

    // Never include errors due to check above
    const activeDocumentTriggersForAllDocumentsInCommit =
      activeTriggersForDocumentsInCommitResult.map((result) => result.unwrap())

    for (const triggersPerDocument of activeDocumentTriggersForAllDocumentsInCommit) {
      for (const trigger of triggersPerDocument) {
        const deleteResult = await deleteDocumentTrigger(
          {
            workspace,
            commit,
            triggerUuid: trigger.uuid,
          },
          transaction,
        )

        if (!Result.isOk(deleteResult)) {
          return deleteResult
        }
      }
    }

    return Result.ok(undefined)
  })
}
