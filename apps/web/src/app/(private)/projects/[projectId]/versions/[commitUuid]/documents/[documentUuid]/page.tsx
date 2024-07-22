export default function DocumentPage({
  params,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
}) {
  return <div>Documents {params.documentUuid}</div>
}
