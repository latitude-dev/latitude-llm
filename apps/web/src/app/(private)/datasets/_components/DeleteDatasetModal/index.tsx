import { DatasetV2 } from '@latitude-data/core/browser'
import { ReactStateDispatch } from '@latitude-data/web-ui'
import { destroyDatasetAction } from '$/actions/datasetsV2/destroy'
import DestroyModal from '$/components/modals/DestroyModal'
import useDatasets from '$/stores/datasetsV2'
import { useRouter } from 'next/navigation'

export default function DeleteDatasetModal({
  dataset,
  page,
  pageSize,
  setDataset,
}: {
  dataset: DatasetV2 | null
  page: string
  pageSize: string
  setDataset: ReactStateDispatch<DatasetV2 | null>
}) {
  const router = useRouter()
  const { destroy } = useDatasets({
    page,
    pageSize,
  })
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
