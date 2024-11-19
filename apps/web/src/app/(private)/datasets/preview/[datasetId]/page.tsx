import { getDatasetCached } from '$/app/(private)/_data-access'

import PreviewDatasetModal from './_components/PreviewDatasetModal'

export default async function DatasetPreviewPage({
  params,
}: {
  params: Promise<{ datasetId: string }>
}) {
  const dataset = await getDatasetCached((await params).datasetId)

  return <PreviewDatasetModal dataset={dataset} />
}
