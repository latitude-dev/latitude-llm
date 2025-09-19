import { notFound } from 'next/navigation'
import { findSharedDocumentCached } from '$/app/(public)/_data_access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { findForkedDocument } from '@latitude-data/core/services/publishedDocuments/findForkedDocument'
import { ForkedDocument } from './_components/ForkedDocument'
import { Result } from '@latitude-data/core/lib/Result'

export default async function ForkedDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ publishedDocumentUuid: string; projectId: string }>
  searchParams: Promise<{ commitUuid: string; documentUuid: string }>
}) {
  const { publishedDocumentUuid, projectId } = await params
  const { commitUuid, documentUuid } = await searchParams
  const { workspace, user } = await getCurrentUserOrRedirect()

  const sharedDocumentResult = await findSharedDocumentCached(
    publishedDocumentUuid,
  )

  if (sharedDocumentResult.error || !user || !workspace) return notFound()

  const forkedResult = await findForkedDocument({
    workspace,
    projectId,
    commitUuid,
    documentUuid,
  })

  if (!Result.isOk(forkedResult)) return notFound()

  const { project, commit, document } = forkedResult.unwrap()
  const sharedDocument = sharedDocumentResult.unwrap()
  const shared = sharedDocument.shared

  return (
    <ForkedDocument
      shared={shared}
      project={project}
      commit={commit}
      document={document}
    />
  )
}
