import ConnectEvaluationModal from './_components/ConnectEvaluationModal'

export default async function ConnectionEvaluationModalPage({
  params,
}: {
  params: {
    projectId: string
    commitUuid: string
    documentUuid: string
  }
}) {
  const documentUuid = params.documentUuid
  const commitUuid = params.commitUuid
  return (
    <ConnectEvaluationModal
      projectId={params.projectId}
      commitUuid={commitUuid}
      documentUuid={documentUuid}
    />
  )
}
