import { Dataset } from '@latitude-data/core/browser'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { destroyDatasetAction } from '$/actions/datasets/destroy'
import DestroyModal from '$/components/modals/DestroyModal'
import useDatasets from '$/stores/datasets'
import { useRouter } from 'next/navigation'

export default function DeleteDatasetModal({
  dataset,
  page,
  pageSize,
  setDataset,
}: {
  dataset: Dataset | null
  setDataset: ReactStateDispatch<Dataset | null>
  page: string
  pageSize: string
}) {
  const router = useRouter()
  const { destroy } = useDatasets({ page, pageSize })
  if (!dataset) return null

  return (
    <DestroyModal<typeof destroyDatasetAction>
      title={`Delete ${dataset.name}`}
      description='Deleted datasets will no longer accessible to generate new evaluations.'
      onOpenChange={(open: boolean) => !open && setDataset(null)}
      action={destroy}
      submitStr='Delete dataset'
      model={dataset}
      onSuccess={() => {
        router.refresh()

        setDataset(null)
      }}
    />
  )
}
