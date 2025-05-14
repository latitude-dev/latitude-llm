import { Result } from '../../../../../lib/Result'
import { DocumentVersionsRepository } from '../../../../../repositories'
import { CopilotTool } from '../types'

const listPrompts: CopilotTool = async ({ workspace, commit }) => {
  const docsScope = new DocumentVersionsRepository(workspace.id)

  const docsResult = await docsScope.getDocumentsAtCommit(commit)
  if (!docsResult.ok) return docsResult

  const documents = docsResult.unwrap()
  return Result.ok(
    documents.map((doc) => ({
      path: doc.path,
      uuid: doc.documentUuid,
      isAgent: doc.documentType === 'agent',
    })),
  )
}

export default listPrompts
