import { DocumentEditor } from '@latitude-data/web-ui'
import { getDocument } from '$core/data-access'

export const dynamic = 'force-dynamic'

export default async function Editor({
  params,
}: {
  params: { projectId: number; commitUuid: string; documentId: number }
}) {
  const result = await getDocument({
    projectId: params.projectId,
    commitUuid: params.commitUuid,
    documentId: params.documentId,
  })
  const { content } = result.unwrap()

  return (
    <div className='w-full h-full relative'>
      <DocumentEditor content={content} />
    </div>
  )
}
