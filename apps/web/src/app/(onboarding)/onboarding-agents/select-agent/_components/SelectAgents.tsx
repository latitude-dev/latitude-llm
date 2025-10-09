'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import AgentCard from './AgentCard'
import HoverCard from './HoverCard'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { BackgroundHoverColor } from '@latitude-data/web-ui/tokens'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { useCallback } from 'react'
import useWorkspaceOnboarding from '$/stores/workspaceOnboarding'

export type AgentCardProps = {
  mainIcon: IconName
  title: string
  description: string
  color: BackgroundHoverColor
  documentUuid: string
  usedThirdPartyIconsSrc: string[]
}
const agents: AgentCardProps[] = [
  {
    mainIcon: 'mail',
    title: 'Cold email outreach',
    description:
      'Finds new AI-tool leads, writes and sends tailored cold emails, follows up, and updates deal status.',
    color: 'accentForeground',
    // TODO(onboarding): change to production uuid when opening to production
    documentUuid: 'ddada8e6-ae2c-4fa6-8969-724a8a938cd6',
    usedThirdPartyIconsSrc: [
      // These are the pipedream assets that end up being cached and saved in the database once the integration is created
      'https://assets.pipedream.net/s.v0/app_OkrhlP/logo/orig',
      'https://assets.pipedream.net/s.v0/app_1dBhRX/logo/orig',
      'https://assets.pipedream.net/s.v0/app_OQYhq7/logo/orig',
    ],
  },
  {
    mainIcon: 'squareChart',
    title: 'Content creator',
    description:
      'Turns each new blog post into a LinkedIn thread, Reddit post, and newsletter — then posts them on schedule and tracks performance.',
    color: 'latte',
    // TODO(onboarding): change to production uuid when opening to production
    documentUuid: 'ddada8e6-ae2c-4fa6-8969-724a8a938cd6',
    usedThirdPartyIconsSrc: [
      'https://assets.pipedream.net/s.v0/app_X7Lhxr/logo/orig',
      'https://assets.pipedream.net/s.v0/app_1dBhRX/logo/orig',
      'https://assets.pipedream.net/s.v0/app_mo7hbd/logo/orig',
    ],
  },

  {
    mainIcon: 'newspaper',
    title: 'News curator',
    description:
      'Fetches the latest articles on any topic or company, summarizes the top 3 in plain language, and emails you the highlights.',
    color: 'destructive',
    // TODO(onboarding): change to production uuid when opening to production
    documentUuid: '1152b1ab-1bd7-4091-94bc-fe00cdd03f30',
    usedThirdPartyIconsSrc: [
      'https://assets.pipedream.net/s.v0/app_X7Lhxr/logo/orig',
      'https://assets.pipedream.net/s.v0/app_1dBhRX/logo/orig',
      'https://assets.pipedream.net/s.v0/app_mo7hbd/logo/orig',
    ],
  },
]

export function SelectAgents() {
  const { executeCompleteOnboarding } = useWorkspaceOnboarding()

  const handleStartFromScratch = useCallback(() => {
    executeCompleteOnboarding()
    redirect(ROUTES.dashboard.root)
  }, [executeCompleteOnboarding])

  const handleSelectAgent = useCallback((documentUuid: string) => {
    redirect(`/actions/clone-agent?uuid=${documentUuid}`)
  }, [])

  return (
    <div className='flex flex-col gap-y-10 p-16 items-center'>
      <div className='flex flex-col gap-y-2'>
        <div className='flex flex-row gap-x-2 items-center'>
          <Text.H2M>Welcome to Latitude</Text.H2M>
          <div className='flex flex-row bg-muted rounded-lg p-2'>
            <Icon name='logo' size='large' />
          </div>
        </div>
        <div className='flex flex-col items-center'>
          <Text.H5 color='foregroundMuted'>There are no projects yet.</Text.H5>
          <Text.H5 color='foregroundMuted'>
            Let's create your first one on Latitude.
          </Text.H5>
        </div>
      </div>
      <div className='flex flex-col gap-y-4 items-center'>
        <div className='flex flex-row gap-x-3 w-full justify-center'>
          {agents.map((agent, index) => (
            <HoverCard backgroundHoverColor={agent.color} key={index}>
              <AgentCard
                agent={agent}
                key={index}
                onClick={() => handleSelectAgent(agent.documentUuid)}
              />
            </HoverCard>
          ))}
        </div>
        <Text.H5 color='foregroundMuted'>or</Text.H5>
        <Button
          fancy
          variant='outline'
          iconProps={{ name: 'plus' }}
          onClick={handleStartFromScratch}
        >
          Start from scratch
        </Button>
      </div>
    </div>
  )
}
