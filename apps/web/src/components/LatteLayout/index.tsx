'use client'

import { ReactNode } from 'react'
import { LatteChat } from '$/components/LatteChat'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { type ProviderLogDto } from '@latitude-data/core/schema/types'

export function LatteLayout({
  children,
  initialThreadUuid,
  initialProviderLog,
}: {
  children: ReactNode
  initialThreadUuid?: string
  initialProviderLog?: ProviderLogDto
}) {
  return (
    <SplitPane
      direction='horizontal'
      initialPercentage={50}
      minSize={500 + 32} // 500 (tabs + deploy button) + 32px (x-padding)
      firstPane={children}
      secondPane={
        <ClientOnly>
          <LatteChat
            initialThreadUuid={initialThreadUuid}
            initialProviderLog={initialProviderLog}
          />
        </ClientOnly>
      }
    />
  )
}
