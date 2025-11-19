'use client'

import { ReactNode } from 'react'

import { BackofficeRoutes, ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { TabSelector } from '$/components/TabSelector'

export function BackofficeTabs({ children }: { children: ReactNode }) {
  const selected = useSelectedLayoutSegment() as BackofficeRoutes
  return (
    <div className='container flex flex-col w-full gap-4'>
      <div className='w-full flex items-center justify-between gap-4 p-4 pb-0'>
        <TabSelector
          showSelectedOnSubroutes
          options={[
            {
              label: 'Search',
              value: BackofficeRoutes.search,
              route: ROUTES.backoffice.search.root,
            },
            {
              label: 'Rewards',
              value: BackofficeRoutes.rewards,
              route: ROUTES.backoffice.rewards.root,
            },
            {
              label: 'Users',
              value: BackofficeRoutes.users,
              route: ROUTES.backoffice.users.root,
            },
            {
              label: 'Usage overview',
              value: BackofficeRoutes.usageOverview,
              route: ROUTES.backoffice.usageOverview.root,
            },
            {
              label: 'Triggers',
              value: BackofficeRoutes.triggers,
              route: ROUTES.backoffice.triggers.root,
            },
            {
              label: 'Features',
              value: BackofficeRoutes.features,
              route: ROUTES.backoffice.features.root,
            },
            {
              label: 'Grants',
              value: BackofficeRoutes.grants,
              route: ROUTES.backoffice.grants.root,
            },
            {
              label: 'Promocodes',
              value: BackofficeRoutes.promocodes,
              route: ROUTES.backoffice.promocodes.root,
            },
            {
              label: 'Integrations',
              value: BackofficeRoutes.integrations,
              route: ROUTES.backoffice.integrations.root,
            },
          ]}
          selected={selected}
        />
        <Link href={ROUTES.dashboard.root}>
          <Button
            variant='link'
            size='none'
            iconProps={{ name: 'arrowRight', placement: 'right' }}
          >
            Go back
          </Button>
        </Link>
      </div>
      {children}
    </div>
  )
}
