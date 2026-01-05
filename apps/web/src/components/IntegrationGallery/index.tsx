'use client'

import { useState, useCallback } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { FrameworkDefinition, MODEL_PROVIDERS, FRAMEWORKS } from './frameworks'
import { FrameworkCard } from './FrameworkCard'
import { InstallationSteps } from './InstallationSteps'

function FrameworkGallery({
  onSelectFramework,
}: {
  onSelectFramework: (framework: FrameworkDefinition) => void
}) {
  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-4'>
        <Text.H5M color='foregroundMuted'>Model Providers</Text.H5M>
        <div className='grid grid-cols-3 gap-4'>
          {MODEL_PROVIDERS.map((framework) => (
            <FrameworkCard
              key={framework.name}
              framework={framework}
              onClick={() => onSelectFramework(framework)}
            />
          ))}
        </div>
      </div>

      <div className='flex flex-col gap-4'>
        <Text.H5M color='foregroundMuted'>Frameworks</Text.H5M>
        <div className='grid grid-cols-3 gap-4'>
          {FRAMEWORKS.map((framework) => (
            <FrameworkCard
              key={framework.name}
              framework={framework}
              onClick={() => onSelectFramework(framework)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function FrameworkInstructions({
  framework,
  workspaceApiKey,
  projectId,
}: {
  framework: FrameworkDefinition
  workspaceApiKey?: string
  projectId: number
}) {
  return (
    <div className='flex flex-col gap-6'>
      <Text.H4M>Manual installation for {framework.name}</Text.H4M>
      <InstallationSteps
        framework={framework}
        workspaceApiKey={workspaceApiKey}
        projectId={projectId}
      />
    </div>
  )
}

export function IntegrationGalleryModal({
  open,
  onOpenChange,
  workspaceApiKey,
  projectId,
  onInviteDevelopers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceApiKey?: string
  projectId: number
  onInviteDevelopers?: () => void
}) {
  const [selectedFramework, setSelectedFramework] =
    useState<FrameworkDefinition | null>(null)

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setSelectedFramework(null)
      }
      onOpenChange(open)
    },
    [onOpenChange],
  )

  const handleBack = useCallback(() => {
    setSelectedFramework(null)
  }, [])

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={handleOpenChange}
      size='large'
      title={
        selectedFramework
          ? `Integrate with ${selectedFramework.name}`
          : 'Integrate Latitude in your project'
      }
      description='Select your AI provider or framework to get started with Latitude integration.'
      footerAlign={selectedFramework ? 'justify' : 'right'}
      footer={
        selectedFramework ? (
          <>
            <Button
              variant='outline'
              fancy
              iconProps={{ name: 'chevronLeft', placement: 'left' }}
              onClick={handleBack}
            >
              Back to integrations
            </Button>
            <div className='flex gap-2'>
              {onInviteDevelopers && (
                <Button
                  fancy
                  onClick={onInviteDevelopers}
                  iconProps={{ name: 'userRoundPlus', placement: 'left' }}
                >
                  Invite developers
                </Button>
              )}
              <Button
                fancy
                variant='outline'
                onClick={() => handleOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            {onInviteDevelopers && (
              <Button
                fancy
                onClick={onInviteDevelopers}
                iconProps={{ name: 'userRoundPlus', placement: 'left' }}
              >
                Invite developers
              </Button>
            )}
            <Button
              fancy
              variant='outline'
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
          </>
        )
      }
    >
      {selectedFramework ? (
        <FrameworkInstructions
          framework={selectedFramework}
          workspaceApiKey={workspaceApiKey}
          projectId={projectId}
        />
      ) : (
        <FrameworkGallery onSelectFramework={setSelectedFramework} />
      )}
    </Modal>
  )
}

