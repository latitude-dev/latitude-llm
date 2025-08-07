'use client'

import React from 'react'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { LatteChat } from '$/components/LatteChat'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'

export function LatteLayout({ children }: { children: React.ReactNode }) {
  return (
    <SplitPane
      direction='horizontal'
      initialPercentage={50}
      minSize={300}
      firstPane={children}
      secondPane={
        <ClientOnly>
          <LatteChat />
        </ClientOnly>
      }
    />
  )
}
