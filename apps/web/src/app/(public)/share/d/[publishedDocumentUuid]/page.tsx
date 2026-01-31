import buildMetatags from '$/app/_lib/buildMetatags'
import { findSharedDocumentCached } from '$/app/(public)/_data_access'
import { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'

import { SharedDocument } from './_components/SharedDocument'

async function buildQueryParams({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      decodeURIComponent(key),
      typeof value === 'string' ? decodeURIComponent(value) : value,
    ]),
  )
}

export async function generateMetadata(
  {
    params,
  }: {
    params: Promise<{ publishedDocumentUuid: string }>
  },
  parent: ResolvingMetadata,
): Promise<Metadata> {
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
  } catch (_error) {
    return buildMetatags({ title: 'Not Found', parent: parentMetadata })
  }
}

export default async function SharedDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ publishedDocumentUuid: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { publishedDocumentUuid } = await params
  const result = await findSharedDocumentCached(publishedDocumentUuid)

  if (result.error) return notFound()

  const queryParams = await buildQueryParams({ searchParams })
  const { shared, metadata } = result.value
  return (
    <SharedDocument
      metadata={metadata}
      shared={shared}
      queryParams={queryParams}
    />
  )
}
