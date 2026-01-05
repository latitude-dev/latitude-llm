'use client'

import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { FrameworkDefinition } from '$/components/IntegrationGallery/frameworks'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { InstallationSteps } from '$/components/IntegrationGallery/InstallationSteps'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'

export default function InstallationModal({
  framework,
  setFramework,
  workspaceApiKey,
  projectId,
  onOpenInviteModal,
}: {
  framework: FrameworkDefinition | null
  setFramework: (framework: FrameworkDefinition | null) => void
  workspaceApiKey: string
  projectId: number
  onOpenInviteModal: () => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(!!framework), [framework])

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) return

      setOpen(false)
      setTimeout(() => setFramework(null), 500)
    },
    [setFramework],
  )

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      size='large'
      title={`Integrate Latitude with ${framework?.name ?? 'your project'}`}
      description='Invite a developer to help integrate Latitude into your project.'
      footer={
        <>
          <Button
            fancy
            onClick={onOpenInviteModal}
            iconProps={{ name: 'userRoundPlus', placement: 'left' }}
          >
            Invite developers
          </Button>
          <CloseTrigger />
        </>
      }
    >
      {framework ? (
        <div className='flex flex-col gap-6'>
          <Text.H4M>Manual installation</Text.H4M>
          <InstallationSteps
            framework={framework}
            workspaceApiKey={workspaceApiKey}
            projectId={projectId}
          />
        </div>
      ) : null}
    </Modal>
  )
}
