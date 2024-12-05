import ConnectEvaluationModal from './_components/ConnectEvaluationModal'

export default async function ConnectionEvaluationModalPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  const { projectId, commitUuid, documentUuid } = await params
  return (
    <ConnectEvaluationModal
      projectId={projectId}
      commitUuid={commitUuid}
      documentUuid={documentUuid}
    />
  )
}
