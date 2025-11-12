import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { BadRequestError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
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
  // Check if commit is merged before proceeding
  if (commit.mergedAt !== null) {
    return Result.error(new BadRequestError('Cannot modify a merged commit'))
  }

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
}
