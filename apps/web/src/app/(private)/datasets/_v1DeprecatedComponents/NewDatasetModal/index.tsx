import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import {
  NewDatasetModalComponent,
  type NewDatasetModalProps,
} from '../../_components/RootHeader/NewDatasetModal'

export default function NewDatasetV1Modal({
  open,
  onOpenChange,
}: NewDatasetModalProps) {
  const navigate = useNavigate()
  const { enabled: canNotModifyDatasets } = useFeatureFlag({
    featureFlag: 'datasetsV1ModificationBlocked',
  })
  const { createError, createFormAction, isCreating } = useDatasets({
    onCreateSuccess: (dataset) =>
      navigate.push(ROUTES.datasets.detail(dataset.id)),
  })

  if (canNotModifyDatasets) {
    return (
      <ConfirmModal
        open={open}
        dismissible
        title='Dataset creation disabled'
        description='Maintenance in progress. Please try again later.'
        onConfirm={() => onOpenChange(false)}
        confirm={{
          label: 'Back to datasets',
          description:
            "We're running some maintenance on datasets. At the moment is not possible to create new datasets. Please try again later.",
        }}
      />
    )
  }

  return (
    <NewDatasetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      createFormAction={createFormAction}
      isCreating={isCreating}
      createError={createError}
    />
  )
}
