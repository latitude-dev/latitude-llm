import { database } from '../../client'
import { Result } from '../../lib/Result'
import { DocumentVersionsRepository } from '../../repositories'
import { Copilot } from './shared'
import { getCopilotData } from './getCopilotData'

export async function getCopilot({ path }: { path: string }, db = database) {
  const copilotData = await getCopilotData(db)
  if (copilotData.error) return copilotData

  const { workspace, commit } = copilotData.unwrap()

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
