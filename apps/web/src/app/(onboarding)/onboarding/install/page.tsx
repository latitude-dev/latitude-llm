'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { skipOnboardingAction } from '$/actions/onboarding/skip'
import { publishEventAction } from '$/actions/events/publishEventAction'
import InviteDeveloperModal from './_components/InviteDeveloperModal'
import {
  useLocalStorage,
  AppLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import useApiKeys from '$/stores/apiKeys'
import { FrameworkDefinition, FRAMEWORKS } from './frameworks'
import InstallationModal from './_components/InstallationModal'
import { useHover } from '@latitude-data/web-ui/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { useCurrentProject } from '$/app/providers/ProjectProvider'

function FrameworkCard({
  framework,
  onClick,
}: {
  framework: FrameworkDefinition
  onClick: () => void
}) {
  const [ref, isHovered] = useHover<HTMLDivElement>()

  return (
    <Button
      key={framework.name}
      variant='ghost'
      className='p-0'
      fullWidth
      onClick={onClick}
    >
      <div
        ref={ref}
        className={cn(
          'w-full flex flex-col gap-2 p-4 rounded-lg',
          'border border-border hover:border-primary hover:bg-accent transition-colors',
        )}
      >
        <Icon
          name={framework.icon}
          color={isHovered ? 'accentForeground' : 'foregroundMuted'}
        />
        <Text.H5M color={isHovered ? 'accentForeground' : 'foreground'}>
          {framework.name}
        </Text.H5M>
      </div>
    </Button>
  )
}

export default function OnboardingInstallPage() {
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const { execute: skipOnboarding, isPending: isSkipping } =
    useLatitudeAction(skipOnboardingAction)
  const { execute: publishEvent } = useLatitudeAction(publishEventAction)
  const { setValue: setReplayOnboarding } = useLocalStorage<boolean>({
    key: AppLocalStorage.replayOnboarding,
    defaultValue: false,
  })

  const [selectedFramework, setSelectedFramework] =
    useState<FrameworkDefinition | null>(null)

  useEffect(() => {
    publishEvent({ eventType: 'installOnboardingPageVisited' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: apiKeys } = useApiKeys()
  const { project } = useCurrentProject()

  const firstApiKey = apiKeys?.[0]

  const handleSkip = useCallback(() => {
    setReplayOnboarding(false)
    skipOnboarding()
  }, [skipOnboarding, setReplayOnboarding])

  const onOpenInviteModal = useCallback(() => {
    setSelectedFramework(null)
    setInviteModalOpen(true)
  }, [setSelectedFramework, setInviteModalOpen])

  return (
    <div className='flex flex-col h-screen'>
      <InviteDeveloperModal
        open={inviteModalOpen}
        setOpen={setInviteModalOpen}
      />
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
            fancy
            onClick={onOpenInviteModal}
            iconProps={{ name: 'userRoundPlus', placement: 'left' }}
          >
            Invite developers
          </Button>
          <Button
            variant='outline'
            fancy
            onClick={handleSkip}
            disabled={isSkipping}
            iconProps={{ name: 'arrowRight', placement: 'right' }}
          >
            {isSkipping ? 'Finishing...' : 'Skip'}
          </Button>
        </div>
      </header>

      <main className='flex-1 overflow-hidden items-center flex flex-col'>
        <div className='grid grid-cols-2 gap-x-4 gap-y-2 max-w-2xl w-full p-6'>
          {FRAMEWORKS.map((framework) => (
            <FrameworkCard
              key={framework.name}
              framework={framework}
              onClick={() => setSelectedFramework(framework)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
