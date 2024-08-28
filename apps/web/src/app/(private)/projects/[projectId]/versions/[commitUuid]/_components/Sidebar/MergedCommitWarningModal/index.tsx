import { ConfirmModal, ReactStateDispatch } from '@latitude-data/web-ui'

export default function MergedCommitWarningModal({
  open,
  setOpen,
  onConfirm,
}: {
  open: boolean
  setOpen: ReactStateDispatch<boolean>
  onConfirm: () => void
}) {
  return (
    <ConfirmModal
      type='default'
      open={open}
      onConfirm={() => {
        setOpen(false)
        onConfirm()
      }}
      onOpenChange={setOpen}
      title='Merged commit can not be edited'
      description='Detected change in protected commit.'
      confirm={{
        label: 'Create version',
        description:
          'You are trying to change a publised version of this project. If you want to make changes, create a new version.',
      }}
    />
  )
}
