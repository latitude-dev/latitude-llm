import { AnnotationQueueItemView } from './_components/AnnotationQueueItemView'

export default async function AnnotationQueueItemPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    queueId: string
    itemId: string
  }>
}) {
  const { queueId, itemId } = await params

  return (
    <AnnotationQueueItemView
      queueId={Number(queueId)}
      itemId={itemId}
    />
  )
}
