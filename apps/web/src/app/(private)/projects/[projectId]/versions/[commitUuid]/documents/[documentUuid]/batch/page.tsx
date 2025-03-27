import { BATCH_MODAL_NAME } from '../_components/constants'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

// Legacy. Here for the redirect
export default async function BatchPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  const { projectId, commitUuid, documentUuid } = await params

  const editorRoot = ROUTES.projects
    .detail({ id: +projectId })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: documentUuid }).editor.root
  return redirect(`${editorRoot}?modal=${BATCH_MODAL_NAME}`)
}
