import { EditTriggerModal } from '../../../@modal/(.)triggers/[triggerUuid]/edit/EditTriggerModal'
import { ROUTES } from '$/services/routes'
import { HEAD_COMMIT } from '@latitude-data/constants'

export default async function EditTriggerPageModal({
  params,
}: {
  params: Promise<{
    triggerUuid: string
    projectId: string
    commitUuid: string
  }>
}) {
  const { triggerUuid, projectId, commitUuid } = await params
  const isHead = commitUuid === HEAD_COMMIT ? HEAD_COMMIT : null
  const previewPath = ROUTES.projects
    .detail({ id: Number(projectId) })
    .commits.detail({ uuid: isHead ? HEAD_COMMIT : commitUuid }).preview.root

  return (
    <EditTriggerModal triggerUuid={triggerUuid} redirectPath={previewPath} />
  )
}
