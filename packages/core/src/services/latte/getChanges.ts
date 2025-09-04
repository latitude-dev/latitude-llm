import { DocumentVersion, LatteChange, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  LatteThreadsRepository,
} from '../../repositories'

async function getChange(
  {
    workspace,
    documentUuid,
    commitId,
    previous,
  }: {
    workspace: Workspace
    documentUuid: string
    commitId: number
    previous: DocumentVersion | null
  },
  transaction = new Transaction(),
): PromisedResult<LatteChange> {
  return transaction.call(async (tx) => {
    const commitScope = new CommitsRepository(workspace.id, tx)
    const commitResult = await commitScope.getCommitById(commitId)
    if (!Result.isOk(commitResult)) return commitResult
    const commit = commitResult.unwrap()

    const documentsScope = new DocumentVersionsRepository(workspace.id, tx)
    const documentResult = await documentsScope.getDocumentAtCommit({
      documentUuid,
      commitUuid: commit.uuid,
      projectId: commit.projectId,
    })
    if (!Result.isOk(documentResult)) return documentResult
    const document = documentResult.unwrap()

    return Result.ok({
      projectId: commit.projectId,
      draftUuid: commit.uuid,
      previous,
      current: document,
    })
  })
}

export async function getLatteThreadChanges(
  {
    workspace,
    threadUuid,
  }: {
    workspace: Workspace
    threadUuid: string
  },
  transaction = new Transaction(),
): PromisedResult<LatteChange[]> {
  return transaction.call(async (tx) => {
    const latteThreadScope = new LatteThreadsRepository(workspace.id, tx)
    const checkpointsResult =
      await latteThreadScope.findAllCheckpoints(threadUuid)
    if (!Result.isOk(checkpointsResult)) return checkpointsResult
    const checkpoints = checkpointsResult.unwrap()

    const changes: LatteChange[] = []
    for await (const checkpoint of checkpoints) {
      const changeResult = await getChange({
        workspace,
        documentUuid: checkpoint.documentUuid,
        commitId: checkpoint.commitId,
        previous: checkpoint.data,
      })
      if (!Result.isOk(changeResult)) return changeResult

      changes.push(changeResult.unwrap())
    }

    return Result.ok(changes)
  })
}
