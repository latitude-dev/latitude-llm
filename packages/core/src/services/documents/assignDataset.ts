import { Commit, Dataset, DocumentVersion, Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction, TypedResult } from '../../lib'
import { NotFoundError } from '../../lib/errors'
import { DocumentVersionsRepository } from '../../repositories/documentVersionsRepository'
import { documentVersions } from '../../schema'

export async function assignDataset(
  {
    workspace,
    commit,
    dataset,
    documentUuid,
  }: {
    workspace: Workspace
    commit: Commit
    dataset: Dataset
    documentUuid: string
  },
  trx = database,
): Promise<TypedResult<DocumentVersion, Error>> {
  return await Transaction.call(async (tx) => {
    const docsScope = new DocumentVersionsRepository(workspace!.id, tx)
    const documents = (await docsScope.getDocumentsAtCommit(commit)).unwrap()
    const doc = documents.find((d) => d.documentUuid === documentUuid)

    if (!doc) {
      return Result.error(new NotFoundError('Document does not exist'))
    }

    const result = await tx
      .update(documentVersions)
      .set({ datasetId: dataset.id })
      .returning()

    return Result.ok(result[0]!)
  }, trx)
}
