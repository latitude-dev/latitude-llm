import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

// TODO: remove after 2 weeks the migration to datasets V2 is finished
export default async function DatasetPreviewPage({
  params,
}: {
  params: Promise<{ datasetId: string }>
}) {
  const { datasetId } = await params

  return redirect(ROUTES.datasets.detail(datasetId))
}
