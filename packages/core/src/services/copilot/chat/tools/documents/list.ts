import { Result } from '../../../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../../repositories'
import { LatteToolFn } from '../types'

const listPrompts: LatteToolFn<{
  projectId: number
  commitUuid: string
}> = async ({ workspace, parameters: { projectId, commitUuid } }) => {
  const commitsScope = new CommitsRepository(workspace.id)
  const commitResult = await commitsScope.getCommitByUuid({
    projectId,
    uuid: commitUuid,
  })
  if (!commitResult.ok) return commitResult
  const commit = commitResult.unwrap()

  const docsScope = new DocumentVersionsRepository(workspace.id)
  const docsResult = await docsScope.getDocumentsAtCommit(commit)
  if (!docsResult.ok) return docsResult

  const documents = docsResult.unwrap()
  return Result.ok(
    documents.map((doc) => ({
      path: doc.path,
      uuid: doc.documentUuid,
      isAgent: doc.documentType === 'agent',
      href: `/projects/${projectId}/versions/${commitUuid}/documents/${doc.documentUuid}`,
    })),
  )
}

export default listPrompts
