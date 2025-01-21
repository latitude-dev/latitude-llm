import { Workspace } from '../../../browser'
import { Result } from '../../../lib'
import {
  CommitsRepository,
  DocumentLogsRepository,
  DocumentVersionsRepository,
} from '../../../repositories'
import { getCachedChain } from '../../chains/chainCache'

export async function findPausedChain({
  workspace,
  documentLogUuid,
}: {
  workspace: Workspace
  documentLogUuid: string | undefined
}) {
  const cachedData = await getCachedChain({ workspace, documentLogUuid })
  if (!cachedData) return undefined

  const logsRepo = new DocumentLogsRepository(workspace.id)
  const logResult = await logsRepo.findByUuid(documentLogUuid)
  if (logResult.error) return logResult

  const documentLog = logResult.value
  const commitsRepo = new CommitsRepository(workspace.id)
  const commitResult = await commitsRepo.find(documentLog.commitId)
  if (commitResult.error) return commitResult

  const commit = commitResult.value
  const documentsRepo = new DocumentVersionsRepository(workspace.id)
  const result = await documentsRepo.getDocumentByUuid({
    commitUuid: commit?.uuid,
    documentUuid: documentLog.documentUuid,
  })
  if (result.error) return result

  return Result.ok({
    document: result.value,
    commit,
    pausedChain: cachedData.chain,
    previousResponse: cachedData.previousResponse,
  })
}
