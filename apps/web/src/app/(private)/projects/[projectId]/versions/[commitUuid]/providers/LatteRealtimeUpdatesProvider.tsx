'use client'

import { useLatteProjectChanges, useLatteThreadUpdates } from '$/hooks/latte'
import { memo, ReactNode } from 'react'

export const LatteRealtimeUpdatesProvider = memo(
  ({ children }: { children: ReactNode }) => {
    useLatteThreadUpdates()
    useLatteProjectChanges()

    return children
  },
)
