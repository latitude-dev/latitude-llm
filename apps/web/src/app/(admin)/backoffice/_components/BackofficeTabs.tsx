'use client'

import { ReactNode } from 'react'

import { TabSelector } from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { BackofficeRoutes, ROUTES } from '$/services/routes'
import { useSelectedLayoutSegment } from 'next/navigation'

export function BackofficeTabs({ children }: { children: ReactNode }) {
  const router = useNavigate()
  const selected = useSelectedLayoutSegment() as BackofficeRoutes
  return (
    <div className='flex flex-col w-full gap-4'>
      <div className='w-full p-4 pb-0'>
        <TabSelector
          showSelectedOnSubroutes
          options={[
            {
              label: 'Templates',
              value: BackofficeRoutes.templates,
            },
            {
              label: 'Rewards',
              value: BackofficeRoutes.rewards,
            },
          ]}
          selected={selected}
          onSelect={(value) => {
            router.push(ROUTES.backoffice[value].root)
          }}
        />
      </div>
      {children}
    </div>
  )
}
