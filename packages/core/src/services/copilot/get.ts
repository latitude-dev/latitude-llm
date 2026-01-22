import { database } from '../../client'
import { Result } from '../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { Copilot } from './shared'
import { getCopilotData } from './getCopilotData'

export async function getCopilot({ path }: { path: string }, db = database) {
  const copilotData = await getCopilotData(db)
  if (copilotData.error) return copilotData

  const { workspace, project } = copilotData.value
  const commitsRepository = new CommitsRepository(workspace.id, db)
  const commit = await commitsRepository.getHeadCommit(project.id)
  if (!commit) {
    return Result.error(new Error('Copilot commit not found'))
  }

  const documentsRepository = new DocumentVersionsRepository(workspace.id, db)
  const document = await documentsRepository
    .getDocumentByPath({
      commit: commit,
      path: path,
    })
    .then((r) => r.unwrap())
  if (!document) {
    return Result.error(new Error('Copilot document not found'))
  }

  return Result.ok<Copilot>({ workspace, commit, document })
}
