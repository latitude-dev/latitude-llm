import UploadLogModal from './UploadLogModal'

export default function UploadLogModalPage({
  params,
}: {
  params: {
    documentUuid: string
    projectId: string
    commitUuid: string
  }
}) {
  return (
    <UploadLogModal
      documentUuid={params.documentUuid}
      commitUuid={params.commitUuid}
      projectId={params.projectId}
    />
  )
}
