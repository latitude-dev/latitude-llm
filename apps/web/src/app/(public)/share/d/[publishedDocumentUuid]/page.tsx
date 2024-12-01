import buildMetatags from '$/app/_lib/buildMetatags'
import { findSharedDocumentCached } from '$/app/(public)/_data_access'
import { ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'

import { SharedDocument } from './_components/SharedDocument'

export async function generateMetadata(
  {
    params,
  }: {
    params: Promise<{ publishedDocumentUuid: string }>
  },
  parent: ResolvingMetadata,
) {
  // Wait for parent metadata to resolve to ensure auth middleware is executed
  const parentMetadata = await parent

  const { publishedDocumentUuid } = await params

  try {
    const data = await findSharedDocumentCached(publishedDocumentUuid).then(
      (r) => r.unwrap(),
    )

    return buildMetatags({
      title: data.shared.title || 'Untitled Prompt',
      description: data.shared.description ?? '',
      parent: parentMetadata,
    })
  } catch (error) {
    return buildMetatags({ title: 'Not Found', parent: parentMetadata })
  }
}

export default async function SharedDocumentPage({
  params,
}: {
  params: Promise<{ publishedDocumentUuid: string }>
}) {
  const { publishedDocumentUuid } = await params
  const result = await findSharedDocumentCached(publishedDocumentUuid)

  if (result.error) return notFound()

  return <SharedDocument {...result.value} />
}
