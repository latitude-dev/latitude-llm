import { Result } from '../../../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../../repositories'
import { LatteToolFn } from '../types'

const readPrompt: LatteToolFn<{
  projectId: number
  commitUuid: string
  path: string
}> = async ({ workspace, parameters: { projectId, commitUuid, path } }) => {
  const commitsScope = new CommitsRepository(workspace.id)
  const commitResult = await commitsScope.getCommitByUuid({
    projectId: projectId,
    uuid: commitUuid,
  })
  if (!commitResult.ok) return commitResult
  const commit = commitResult.unwrap()

  const docsScope = new DocumentVersionsRepository(workspace.id)

  const docResult = await docsScope.getDocumentByPath({
    path,
    commit,
  })
  if (!docResult.ok) return docResult

  const document = docResult.unwrap()
  return Result.ok(document.content)
}

export default readPrompt
