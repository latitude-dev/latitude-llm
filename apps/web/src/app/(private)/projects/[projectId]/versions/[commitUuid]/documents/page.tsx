import DocumentsLayout from '../_components/DocumentsLayout'

export default async function DocumentsPage({
  params,
}: {
  params: { projectId: string; commitUuid: string }
}) {
  const projectId = Number(params.projectId)
  const commintUuid = params.commitUuid
  return (
    <DocumentsLayout projectId={projectId} commitUuid={commintUuid}>
      <div>List of documents</div>
    </DocumentsLayout>
  )
}
