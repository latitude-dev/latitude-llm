'use client'

import { useState, useCallback } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  FrameworkDefinition,
  MODEL_PROVIDERS,
  FRAMEWORKS,
} from '$/components/IntegrationGallery/frameworks'
import { FrameworkCard } from '$/components/IntegrationGallery/FrameworkCard'
import { InstallationSteps } from '$/components/IntegrationGallery/InstallationSteps'
import { InviteMembersModal } from '$/components/InviteMembersModal'

type Props = {
  workspaceApiKey?: string
  projectId: number
  onContinue: () => void
  onBack: () => void
  onFinish: () => void
}

export function Step4_Integration({
  workspaceApiKey,
  projectId,
  onContinue,
  onBack,
  onFinish,
}: Props) {
  const [selectedFramework, setSelectedFramework] =
    useState<FrameworkDefinition | null>(null)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)

  const handleBack = useCallback(() => {
    if (selectedFramework) {
      setSelectedFramework(null)
    } else {
      onBack()
    }
  }, [selectedFramework, onBack])

  return (
    <div className='flex flex-col min-h-screen bg-background'>
      <InviteMembersModal
        open={inviteModalOpen}
        setOpen={setInviteModalOpen}
        showContinueButton
        onContinue={onFinish}
      />

      <header className='flex items-center justify-between px-6 py-4 border-b border-border'>
        <div className='flex items-center gap-3'>
          <Icon name='logo' size='large' />
          <div className='flex flex-col'>
            <Text.H4M color='foreground'>
              See your model calls inside Latitude
            </Text.H4M>
            <Text.H6 color='foregroundMuted'>
              When you finish this step, your next AI request will appear
              automatically.
            </Text.H6>
          </div>
        </div>
        <div className='flex items-center gap-3'>
          <Button
            variant='outline'
            fancy
            onClick={handleBack}
            iconProps={{ name: 'chevronLeft', placement: 'left' }}
          >
            Back
          </Button>
          <Button
            variant='default'
            fancy
            onClick={onContinue}
            iconProps={{ name: 'arrowRight', placement: 'right' }}
          >
            I&apos;ve integrated
          </Button>
        </div>
      </header>

      <main className='flex-1 overflow-auto flex flex-col items-center'>
        <div className='flex flex-col gap-6 max-w-3xl w-full p-6'>
          {selectedFramework ? (
            <div className='flex flex-col gap-6'>
              <div className='flex items-center gap-2'>
                <Button
                  variant='ghost'
                  size='small'
                  onClick={() => setSelectedFramework(null)}
                  iconProps={{ name: 'chevronLeft', placement: 'left' }}
                >
                  Back to selection
                </Button>
              </div>
              <Text.H3M color='foreground'>
                Integrate with {selectedFramework.name}
              </Text.H3M>
              <InstallationSteps
                framework={selectedFramework}
                workspaceApiKey={workspaceApiKey}
                projectId={projectId}
              />
            </div>
          ) : (
            <>
              <div className='flex flex-row items-start justify-between gap-4'>
                <div className='flex flex-col gap-2'>
                  <Text.H3M color='foreground'>
                    Select your stack to get started
                  </Text.H3M>
                  <Text.H5 color='foregroundMuted'>
                    Choose your AI provider or framework to see integration
                    instructions.
                  </Text.H5>
                </div>
                <Button
                  variant='outline'
                  fancy
                  onClick={() => setInviteModalOpen(true)}
                  iconProps={{ name: 'userRoundPlus', placement: 'left' }}
                >
                  Invite developers
                </Button>
              </div>

              <div className='flex flex-col gap-4'>
                <Text.H5M color='foregroundMuted'>Model Providers</Text.H5M>
                <div className='grid grid-cols-3 gap-4'>
                  {MODEL_PROVIDERS.map((framework) => (
                    <FrameworkCard
                      key={framework.name}
                      framework={framework}
                      onClick={() => setSelectedFramework(framework)}
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
                      onClick={() => setSelectedFramework(framework)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

