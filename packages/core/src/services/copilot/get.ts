import { env } from '@latitude-data/env'
import { database, Database } from '../../client'
import {
  unsafelyFindWorkspace,
  unsafelyGetApiKeyByToken,
} from '../../data-access'
import { Result } from '../../lib'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { Copilot } from './shared'

export async function getCopilot(
  { path }: { path: string },
  db: Database = database,
) {
  if (!env.COPILOT_WORKSPACE_API_KEY) {
    return Result.error(new Error('COPILOT_WORKSPACE_API_KEY is not set'))
  }

  if (!env.COPILOT_PROJECT_ID) {
    return Result.error(new Error('COPILOT_PROJECT_ID is not set'))
  }

  const apiKey = await unsafelyGetApiKeyByToken(
    {
      token: env.COPILOT_WORKSPACE_API_KEY,
    },
    db,
  ).then((r) => r.unwrap())
  if (!apiKey) {
    return Result.error(new Error('Copilot api key not found'))
  }

  const workspace = await unsafelyFindWorkspace(apiKey.workspaceId, db)
  if (!workspace) {
    return Result.error(new Error('Copilot workspace not found'))
  }

  const commitsRepository = new CommitsRepository(workspace.id, db)
  const commit = await commitsRepository
    .getHeadCommit(env.COPILOT_PROJECT_ID)
    .then((r) => r.unwrap())
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
