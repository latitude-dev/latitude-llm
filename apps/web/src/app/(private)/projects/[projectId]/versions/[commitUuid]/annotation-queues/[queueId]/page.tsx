import { findAnnotationQueueById } from '@latitude-data/core/queries/annotationQueues/findById'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { notFound } from 'next/navigation'
import { AnnotationQueueDetail } from './_components/AnnotationQueueDetail'

export default async function AnnotationQueueDetailPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    queueId: string
  }>
}) {
  const { queueId } = await params
  const { workspace } = await getCurrentUserOrRedirect()

  let queue
  try {
    queue = await findAnnotationQueueById({
      workspaceId: workspace.id,
      id: Number(queueId),
    })
  } catch {
    return notFound()
  }

  return <AnnotationQueueDetail queue={queue} />
}
