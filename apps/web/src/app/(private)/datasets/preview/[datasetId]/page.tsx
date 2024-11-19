import { NotFoundError } from '@latitude-data/core/lib/errors'
import { getDatasetCached } from '$/app/(private)/_data-access'
import { useMetatags } from '$/hooks/useMetatags'
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
  const { datasetId } = await params

  try {
    const dataset = await getDatasetCached(datasetId)

    return useMetatags({
      title: `${dataset.name} (preview)`,
      parent: await parent,
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
