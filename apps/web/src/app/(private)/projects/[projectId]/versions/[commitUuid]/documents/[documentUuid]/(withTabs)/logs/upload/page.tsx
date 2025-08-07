import UploadLogModal from './UploadLogModal'

export default async function UploadLogModalPage({
  params,
}: {
  params: Promise<{
    documentUuid: string
    projectId: string
    commitUuid: string
  }>
}) {
  const { documentUuid, projectId, commitUuid } = await params
  return (
    <UploadLogModal documentUuid={documentUuid} commitUuid={commitUuid} projectId={projectId} />
  )
}
