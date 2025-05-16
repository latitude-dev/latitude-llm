import { LatteDocumentList } from '@latitude-data/constants/latte'
import { Result } from '../../../../../lib/Result'
import { PromisedResult } from '../../../../../lib/Transaction'
import { DocumentVersionsRepository } from '../../../../../repositories'
import { CopilotTool } from '../types'

const listPrompts: CopilotTool = async (
  _,
  { workspace, commit },
): PromisedResult<LatteDocumentList> => {
  const docsScope = new DocumentVersionsRepository(workspace.id)

  const documents = await docsScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  return Result.ok(
    documents.map((doc) => ({
      path: doc.path,
      uuid: doc.documentUuid,
      isAgent: doc.documentType === 'agent',
    })),
  )
}

export default listPrompts
