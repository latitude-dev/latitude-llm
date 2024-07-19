import { getDocumentsAtCommit } from '@latitude-data/core'

import DocumentTree, { CreateNode } from './DocumentTree'

export default async function Sidebar({
  commitUuid,
  projectId,
}: {
  commitUuid: string
  projectId: number
}) {
  const documentsResult = await getDocumentsAtCommit({
    projectId,
    commitUuid,
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
