import { readMetadata } from '@latitude-data/compiler'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { getDocumentByUuidCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import CreateBatchEvaluationModal from './_components/CreateBatchEvaluationModal'

export default async function ConnectionEvaluationModal({
  params,
}: {
  params: {
    projectId: string
    commitUuid: string
    documentUuid: string
    evaluationId: string
  }
}) {
  const { workspace } = await getCurrentUser()
  const evaluationScope = new EvaluationsRepository(workspace.id)
  const evaluation = await evaluationScope
    .find(params.evaluationId)
    .then((r) => r.unwrap())
  const projectId = Number(params.projectId)
  const documentUuid = params.documentUuid
  const commitUuid = params.commitUuid
  const document = await getDocumentByUuidCached({
    projectId,
    commitUuid,
    documentUuid,
  })
  const metadata = await readMetadata({
    prompt: document.content ?? '',
    fullPath: document.path,
  })
  return (
    <CreateBatchEvaluationModal
      evaluation={evaluation}
      document={document}
      documentMetadata={metadata}
      projectId={params.projectId}
      commitUuid={commitUuid}
    />
  )
}
