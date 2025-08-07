import { notFound } from 'next/navigation'
import { findSharedDocumentCached } from '$/app/(public)/_data_access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ForkDocument } from './_components/ForkDocument'

export default async function ForkedDocumentPage({
  params,
}: {
  params: Promise<{ publishedDocumentUuid: string }>
  searchParams: Promise<{ commitUuid: string; documentUuid: string }>
}) {
  const { publishedDocumentUuid } = await params
  const { workspace, user } = await getCurrentUserOrRedirect()

  const result = await findSharedDocumentCached(publishedDocumentUuid)

  if (result.error || !user || !workspace) return notFound()

  return <ForkDocument shared={result.value.shared} />
}
