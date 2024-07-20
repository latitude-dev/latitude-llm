import {
  CommitsRepository,
  DocumentVersionsRepository,
  Project,
} from '@latitude-data/core'

import DocumentTree, { CreateNode } from './DocumentTree'

export default async function Sidebar({
  commitUuid,
  project,
}: {
  commitUuid: string
  project: Project
}) {
  const commitsScope = new CommitsRepository(project.workspaceId)
  const commit = await commitsScope
    .getCommitByUuid({ uuid: commitUuid, project })
    .then((r) => r.unwrap())
  const documentVersionsScope = new DocumentVersionsRepository(
    project.workspaceId,
  )
  const documents = await documentVersionsScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  return (
    <div className='flex flex-col gap-4 p-4'>
      <div className='flex flex-row align-items justify-between'>
        <h2>Prompts</h2>
        <div className='flex flex-row gap-2 align-items'>
          <CreateNode />
        </div>
      </div>
      <DocumentTree documents={documents} />
    </div>
  )
}
