import { NotFoundError } from '@latitude-data/core/lib/errors'
import buildMetatags from '$/app/_lib/buildMetatags'
import { getDatasetCached } from '$/app/(private)/_data-access'
import type { ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'

import PreviewDatasetModal from './_components/PreviewDatasetModal'

export async function generateMetadata(
  {
    params,
  }: {
    params: Promise<{ datasetId: string }>
  },
  parent: ResolvingMetadata,
) {
  // Wait for parent metadata to resolve to ensure auth middleware is executed
  const parentMetadata = await parent

  const { datasetId } = await params

  try {
    const dataset = await getDatasetCached(datasetId)

    return buildMetatags({
      title: `${dataset.name} (preview)`,
      parent: parentMetadata,
    })
  } catch (error) {
    if (error instanceof NotFoundError) return notFound()
    throw error
  }
}

export default async function DatasetPreviewPage({
  params,
}: {
  params: Promise<{ datasetId: string }>
}) {
  const dataset = await getDatasetCached((await params).datasetId)

  return <PreviewDatasetModal dataset={dataset} />
}
