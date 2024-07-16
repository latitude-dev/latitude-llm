import { HEAD_COMMIT } from '$core/constants'
import { getDocumentsAtCommit, listdocumentSnapshots } from '$core/data-access'

export async function materializeDocumentsAtCommit({
  commitUuid = HEAD_COMMIT,
  projectId,
}: {
  commitUuid: string
  projectId: number
}) {
  if (commitUuid === HEAD_COMMIT) {
    const snapshots = (await listdocumentSnapshots()).map(
      (snap) => snap.document_versions,
    )
    return snapshots
  } else {
    return await getDocumentsAtCommit({ commitUuid, projectId })
  }
}
