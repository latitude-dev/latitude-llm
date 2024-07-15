import { uniqBy } from 'lodash-es'

import {
  getDocumentsAtCommit,
  listdocumentSnapshots,
  listStagedDocuments,
} from '@latitude-data/core'

export const HEAD_COMMIT = 'HEAD'

export async function materializeDocumentsAtCommit({
  commitUuid = HEAD_COMMIT,
  staged = true,
}: {
  commitUuid: string
  staged: boolean
}) {
  if (commitUuid === HEAD_COMMIT) {
    const snapshots = (await listdocumentSnapshots()).map(
      (snap) => snap.document_versions,
    )
    if (!staged) return snapshots

    const versions = await listStagedDocuments()
    return uniqBy([...versions, ...snapshots], (doc) => doc.documentUuid)
  } else {
    return await getDocumentsAtCommit(commitUuid)
  }
}
