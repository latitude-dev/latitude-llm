import { NewTrigger } from '$/components/TriggersManagement/NewTrigger'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useCallback, useState } from 'react'

export function NewTriggerButton() {
  const [modalOpen, setModalOpen] = useState(false)
  const onCloseModal = useCallback(() => setModalOpen(false), [])
  const onTriggerCreated = useCallback(() => setModalOpen(false), [])

  return (
    <>
      <Button fancy variant='outline' onClick={() => setModalOpen(true)}>
        Add Trigger
      </Button>

      <Modal
        open={modalOpen}
        dismissible
        scrollable={false}
        size='xl'
        height='screen'
        title='Add new trigger'
        onOpenChange={onCloseModal}
        footer={
          <Alert
            variant='warning'
            description='Triggers run only on published project versions'
            spacing='medium'
          />
        }
      >
        <NewTrigger onTriggerCreated={onTriggerCreated} />
      </Modal>
    </>
  )
}
