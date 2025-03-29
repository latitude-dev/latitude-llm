import { ConfirmModal } from '@latitude-data/web-ui'
import { CLOUD_MESSAGES } from '@latitude-data/core'

export function AutogenerateDatasetNotAvailableModal({
  open,
  onOpenChange,
}: {
  open: boolean

  onOpenChange: (open: boolean) => void
}) {
  return (
    <ConfirmModal
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      title='Auto Generate dataset'
      onConfirm={() => onOpenChange(false)}
      confirm={{
        label: 'Back to datasets',
        description: CLOUD_MESSAGES.autogenerateDatasets,
      }}
    />
  )
}
