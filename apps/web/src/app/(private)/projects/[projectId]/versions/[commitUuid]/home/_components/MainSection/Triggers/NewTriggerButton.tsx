import { NewTrigger } from '$/components/TriggersManagement/NewTrigger'
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
        warningDescription='Triggers run automatically only after the project version is published'
        onOpenChange={onCloseModal}
      >
        <NewTrigger onTriggerCreated={onTriggerCreated} />
      </Modal>
    </>
  )
}
