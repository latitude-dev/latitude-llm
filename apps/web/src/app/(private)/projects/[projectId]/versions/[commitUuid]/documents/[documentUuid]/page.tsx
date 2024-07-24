import { findCommit, getDocumentByUuid } from '$/app/(private)/_data-access'

import ClientDocumentEditor from './_components/DocumentEditor'

export default async function DocumentPage({
  params,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
}) {
  const commit = await findCommit({
    projectId: Number(params.projectId),
    uuid: params.commitUuid,
  })
  const document = await getDocumentByUuid({
    documentUuid: params.documentUuid,
    commitId: commit.id,
  })
  return <ClientDocumentEditor commit={commit} document={document} />
}
