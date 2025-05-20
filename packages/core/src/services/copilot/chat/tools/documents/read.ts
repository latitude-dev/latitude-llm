import { LatteDocument } from '@latitude-data/constants/latte'
import { ErrorResult, Result } from '../../../../../lib/Result'
import { PromisedResult } from '../../../../../lib/Transaction'
import { DocumentVersionsRepository } from '../../../../../repositories'
import { CopilotTool } from '../types'
import { LatitudeError } from '../../../../../lib/errors'

const readPrompt: CopilotTool<{ path: string }> = async (
  { path },
  { workspace, commit },
): PromisedResult<LatteDocument, LatitudeError> => {
  const docsScope = new DocumentVersionsRepository(workspace.id)

  const docResult = await docsScope.getDocumentByPath({
    path,
    commit,
  })
  if (!docResult.ok) return docResult as ErrorResult<LatitudeError>

  const document = docResult.unwrap()
  return Result.ok({
    uuid: document.documentUuid,
    path: document.path,
    content: document.content,
  })
}

export default readPrompt
