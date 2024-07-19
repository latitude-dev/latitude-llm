import { DocumentEditor } from '@latitude-data/web-ui'
import { findCommitByUuid, getDocument } from '$core/data-access'

export const dynamic = 'force-dynamic'

export default async function Editor({
  params,
}: {
  params: { documentId: number; commitUuid: string; projectId: number }
}) {
  const commit = await findCommitByUuid({
    uuid: params.commitUuid,
    projectId: params.projectId,
  })
  const result = await getDocument({
    commitId: commit.unwrap().id,
    documentId: params.documentId,
  })
  const { content } = result.unwrap()

  return (
    <div className='w-full h-full relative'>
      <DocumentEditor content={content} />
    </div>
  )
}
