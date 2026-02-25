export function getDataCacheKey({
  workspaceId,
  projectId,
  commitUuid,
  documentPath,
}: {
  workspaceId: number
  projectId: number
  commitUuid: string
  documentPath: string
}) {
  return `workspace:${workspaceId}:project:${projectId}:version:${commitUuid}:document:${documentPath}`
}
