import { getDocumentsAtCommit } from '@latitude-data/core'
import { findCommit } from '$/app/(private)/_data-access'

import DocumentTree, { CreateNode } from './DocumentTree'

export default async function Sidebar({
  commitUuid,
  projectId,
}: {
  commitUuid: string
  projectId: number
}) {
  const commit = await findCommit({ projectId, uuid: commitUuid })
  const documentsResult = await getDocumentsAtCommit({
    commitId: commit.id,
  })
  const documents = documentsResult.unwrap()

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
