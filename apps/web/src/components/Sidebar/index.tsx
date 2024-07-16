import { listCommits, materializeDocumentsAtCommit } from '@latitude-data/core'

import DocumentTree from './DocumentTree'

export default async function Sidebar({ commitUuid }: { commitUuid: string }) {
  const docsResult = await materializeDocumentsAtCommit({
    commitUuid,
  })

  // TODO: wrap data-access reads in transaction blocks and make use of result
  const commits = await listCommits()

  return <DocumentTree commits={commits} documents={docsResult.unwrap()} />
}
