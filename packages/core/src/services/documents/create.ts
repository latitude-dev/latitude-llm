import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { assertCanEditCommit } from '../../lib/assertCanEditCommit'
import { createNewDocumentUnsafe, defaultDocumentContent } from './createUnsafe'

export { defaultDocumentContent }

export async function createNewDocument(
  {
    workspace,
    user,
    commit,
    path,
    agent,
    content,
    promptlVersion = 1,
    createDemoEvaluation: demoEvaluation = false,
    includeDefaultContent = true,
  }: {
    workspace: Workspace
    user?: User
    commit: Commit
    path: string
    agent?: boolean
    content?: string
    promptlVersion?: number
    createDemoEvaluation?: boolean
    includeDefaultContent?: boolean
  },
  transaction = new Transaction(),
): Promise<TypedResult<DocumentVersion, Error>> {
  return await transaction.call(async (tx) => {
    const canEditCheck = await assertCanEditCommit(commit, tx)
    if (canEditCheck.error) return canEditCheck

    // Delegate to unsafe version that does the actual work
    return createNewDocumentUnsafe(
      {
        workspace,
        user,
        commit,
        path,
        agent,
        content,
        promptlVersion,
        createDemoEvaluation: demoEvaluation,
        includeDefaultContent,
      },
      transaction,
    )
  })
}
