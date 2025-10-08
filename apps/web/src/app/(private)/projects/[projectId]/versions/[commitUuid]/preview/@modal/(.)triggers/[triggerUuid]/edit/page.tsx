import { EditTriggerRouteParams, EditTriggerModal } from './EditTriggerModal'

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
