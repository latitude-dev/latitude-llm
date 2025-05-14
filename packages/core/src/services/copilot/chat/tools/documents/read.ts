import { Result } from '../../../../../lib/Result'
import { DocumentVersionsRepository } from '../../../../../repositories'
import { CopilotTool } from '../types'

const readPrompt: CopilotTool<{ path: string }> = async ({
  workspace,
  commit,
  parameters,
}) => {
  const docsScope = new DocumentVersionsRepository(workspace.id)

  const docResult = await docsScope.getDocumentByPath({
    path: parameters.path,
    commit,
  })
  if (!docResult.ok) return docResult

  const document = docResult.unwrap()
  return Result.ok(document.content)
}

export default readPrompt
