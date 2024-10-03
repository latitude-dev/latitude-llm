import { getDatasetCached } from '$/app/(private)/_data-access'

import PreviewDatasetModal from './_components/PreviewDatasetModal'

export default async function DatasetPreviewPage({
  params,
}: {
  params: { datasetId: string }
}) {
  const dataset = await getDatasetCached(params.datasetId)

  return <PreviewDatasetModal dataset={dataset} />
}
