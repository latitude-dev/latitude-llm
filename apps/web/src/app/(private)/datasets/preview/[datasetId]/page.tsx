import { getDatasetCached } from '$/app/(private)/_data-access'
import { useMetatags } from '$/hooks/useMetatags'
import type { ResolvingMetadata } from 'next'

import PreviewDatasetModal from './_components/PreviewDatasetModal'

export async function generateMetadata(
  {
    params,
  }: {
    params: { datasetId: string }
  },
  parent: ResolvingMetadata,
) {
  const dataset = await getDatasetCached(params.datasetId)

  return useMetatags({
    title: `${dataset.name} (preview)`,
    parent: await parent,
  })
}

export default async function DatasetPreviewPage({
  params,
}: {
  params: Promise<{ datasetId: string }>
}) {
  const dataset = await getDatasetCached((await params).datasetId)

  return <PreviewDatasetModal dataset={dataset} />
}
