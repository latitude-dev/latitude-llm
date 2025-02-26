import { Dataset } from '@latitude-data/core/browser'
import { ReactStateDispatch } from '@latitude-data/web-ui'
import { destroyDatasetAction } from '$/actions/datasets/destroy'
import DestroyModal from '$/components/modals/DestroyModal'
import useDatasets from '$/stores/datasets'
import { useRouter } from 'next/navigation'

export default function DeleteDatasetModal({
  dataset,
  setDataset,
}: {
  dataset: Dataset | null
  setDataset: ReactStateDispatch<Dataset | null>
}) {
  const router = useRouter()
  const { data, destroy } = useDatasets()
  const isLast = data?.length === 1
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
        if (isLast) router.refresh()

        setDataset(null)
      }}
    />
  )
}
