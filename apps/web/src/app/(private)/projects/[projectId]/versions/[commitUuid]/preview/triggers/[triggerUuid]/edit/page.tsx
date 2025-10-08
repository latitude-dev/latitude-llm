import {
  EditTriggerRouteParams,
  EditTriggerModal,
} from '../../../@modal/(.)triggers/[triggerUuid]/edit/EditTriggerModal'

export default async function EditTriggerPageModal({
  params,
}: {
  params: Promise<EditTriggerRouteParams>
}) {
  const { triggerUuid, projectId, commitUuid } = await params
  return (
    <EditTriggerModal
      triggerUuid={triggerUuid}
      projectId={projectId}
      commitUuid={commitUuid}
    />
  )
}
