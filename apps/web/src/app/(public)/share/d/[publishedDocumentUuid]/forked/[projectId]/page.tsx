import { findSharedDocumentCached } from '$/app/(public)/_data_access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { findForkedDocument } from '@latitude-data/core/services/publishedDocuments/findForkedDocument'
import { notFound } from 'next/navigation'
import { ForkedDocument } from './_components/ForkedDocument'

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

  const result = await findSharedDocumentCached(publishedDocumentUuid)

  if (result.error || !user || !workspace) return notFound()

  const forkedResult = await findForkedDocument({
    workspace,
    projectId,
    commitUuid,
    documentUuid,
  })

  if (forkedResult.error) return notFound()

  const { project, commit, document } = forkedResult.value
  const shared = result.value.shared

  return (
    <ForkedDocument
      shared={shared}
      project={project}
      commit={commit}
      document={document}
    />
  )
}
