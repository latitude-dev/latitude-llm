'use client'

import type { ReactNode } from 'react'

import { useNavigate } from '$/hooks/useNavigate'
import { BackofficeRoutes, ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { TabSelector } from '@latitude-data/web-ui/molecules/TabSelector'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'

export function BackofficeTabs({ children }: { children: ReactNode }) {
  const router = useNavigate()
  const selected = useSelectedLayoutSegment() as BackofficeRoutes
  return (
    <div className='container flex flex-col w-full gap-4'>
      <div className='w-full flex items-center justify-between gap-4 p-4 pb-0'>
        <TabSelector
          showSelectedOnSubroutes
          options={[
            {
              label: 'Rewards',
              value: BackofficeRoutes.rewards,
            },
            {
              label: 'Users',
              value: BackofficeRoutes.users,
            },
            {
              label: 'Usage overview',
              value: BackofficeRoutes.usageOverview,
            },
            {
              label: 'Triggers',
              value: BackofficeRoutes.triggers,
            },
            {
              label: 'Features',
              value: BackofficeRoutes.features,
            },
          ]}
          selected={selected}
          onSelect={(value) => {
            router.push(ROUTES.backoffice[value].root)
          }}
        />
        <Link href={ROUTES.dashboard.root}>
          <Button variant='link' size='none' iconProps={{ name: 'arrowRight', placement: 'right' }}>
            Go back
          </Button>
        </Link>
      </div>
      {children}
    </div>
  )
}
