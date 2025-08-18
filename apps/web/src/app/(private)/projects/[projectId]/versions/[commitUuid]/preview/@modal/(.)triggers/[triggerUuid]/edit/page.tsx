import { EditTriggerModal } from './EditTriggerModal'

export default async function EditTriggerPageModal({
  params,
}: {
  params: Promise<{ triggerUuid: string }>
}) {
  const { triggerUuid } = await params
  return <EditTriggerModal triggerUuid={triggerUuid} />
}
