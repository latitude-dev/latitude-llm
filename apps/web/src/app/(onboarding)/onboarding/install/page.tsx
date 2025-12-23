'use client'

import { useState, useCallback } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { skipOnboardingAction } from '$/actions/workspaceOnboarding/skip'
import { InviteMembersModal } from '$/components/InviteMembersModal'
import {
  useLocalStorage,
  AppLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import useApiKeys from '$/stores/apiKeys'
import { useOnboardingInstall } from './_lib/OnboardingInstallProvider'
import {
  FrameworkDefinition,
  MODEL_PROVIDERS,
  FRAMEWORKS,
} from '$/components/IntegrationGallery/frameworks'
import { FrameworkCard } from '$/components/IntegrationGallery/FrameworkCard'
import InstallationModal from './_components/InstallationModal'

export default function OnboardingInstallPage() {
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const { execute: skipOnboarding, isPending: isSkipping } =
    useLatitudeAction(skipOnboardingAction)
  const { setValue: setReplayOnboarding } = useLocalStorage<boolean>({
    key: AppLocalStorage.replayOnboarding,
    defaultValue: false,
  })

  const [selectedFramework, setSelectedFramework] =
    useState<FrameworkDefinition | null>(null)
  const [hasInteracted, setHasInteracted] = useState(false)

  const { data: apiKeys } = useApiKeys()
  const { project } = useOnboardingInstall()

  const firstApiKey = apiKeys?.[0]

  const handleSkip = useCallback(() => {
    setReplayOnboarding(false)
    skipOnboarding()
  }, [skipOnboarding, setReplayOnboarding])

  const handleCardClick = useCallback((framework: FrameworkDefinition) => {
    setSelectedFramework(framework)
    setHasInteracted(true)
  }, [])

  const onOpenInviteModal = useCallback(() => {
    setSelectedFramework(null)
    setInviteModalOpen(true)
  }, [setSelectedFramework, setInviteModalOpen])

  return (
    <div className='flex flex-col h-screen'>
      <InviteMembersModal open={inviteModalOpen} setOpen={setInviteModalOpen} />
      <InstallationModal
        framework={selectedFramework}
        setFramework={setSelectedFramework}
        workspaceApiKey={firstApiKey?.token}
        projectId={project.id}
        onOpenInviteModal={onOpenInviteModal}
      />

      <header className='flex items-center justify-between px-6 py-4 border-b border-border bg-background'>
        <div className='flex items-center gap-3'>
          <Icon name='logo' size='large' />
          <Text.H4M>How to install Latitude on your project</Text.H4M>
        </div>
        <div className='flex items-center gap-3'>
          <Button
            variant={hasInteracted ? 'outline' : 'default'}
            fancy
            onClick={onOpenInviteModal}
            iconProps={{ name: 'userRoundPlus', placement: 'left' }}
          >
            Invite developers
          </Button>
          <Button
            variant={hasInteracted ? 'default' : 'outline'}
            fancy
            onClick={handleSkip}
            disabled={isSkipping}
            iconProps={{ name: 'arrowRight', placement: 'right' }}
          >
            {isSkipping ? 'Finishing...' : hasInteracted ? 'Continue' : 'Skip'}
          </Button>
        </div>
      </header>

      <main className='flex-1 overflow-auto items-center flex flex-col'>
        <div className='flex flex-col gap-6 max-w-3xl w-full p-6'>
          <div className='flex flex-col gap-4'>
            <Text.H5M color='foregroundMuted'>Model Providers</Text.H5M>
            <div className='grid grid-cols-3 gap-4'>
              {MODEL_PROVIDERS.map((framework) => (
                <FrameworkCard
                  key={framework.name}
                  framework={framework}
                  onClick={() => handleCardClick(framework)}
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
                  onClick={() => handleCardClick(framework)}
                />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
