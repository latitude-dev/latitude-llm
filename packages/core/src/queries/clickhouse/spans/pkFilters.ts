export type PkFilters = {
  projectId?: number
  commitUuid?: string
  documentUuid?: string
}

export function buildPkConditions({
  projectId,
  commitUuid,
  documentUuid,
}: PkFilters) {
  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (projectId !== undefined) {
    conditions.push('project_id_key = {projectId: UInt64}')
    params.projectId = projectId
  }
  if (commitUuid) {
    conditions.push('commit_uuid = {commitUuid: UUID}')
    conditions.push('commit_uuid_key = {commitUuid: UUID}')
    params.commitUuid = commitUuid
  }
  if (documentUuid) {
    conditions.push('document_uuid = {documentUuid: UUID}')
    conditions.push('document_uuid_key = {documentUuid: UUID}')
    params.documentUuid = documentUuid
  }

  return { conditions, params }
}
