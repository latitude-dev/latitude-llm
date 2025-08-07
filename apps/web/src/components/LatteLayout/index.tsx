'use client'

import { LatteChat } from '$/components/LatteChat'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import React from 'react'

export function LatteLayout({ children }: { children: React.ReactNode }) {
  return (
    <SplitPane
      direction='horizontal'
      initialPercentage={50}
      minSize={400 + 32} // 400px (tabs) + 32px (x-padding)
      firstPane={children}
      secondPane={
        <ClientOnly>
          <LatteChat />
        </ClientOnly>
      }
    />
  )
}
