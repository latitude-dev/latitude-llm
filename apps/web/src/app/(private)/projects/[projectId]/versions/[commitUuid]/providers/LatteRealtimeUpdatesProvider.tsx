'use client'

import { memo, ReactNode } from 'react'
import { useLatteProjectChanges } from '$/hooks/latte/useLatteProjectChanges'
import { useLatteThreadUpdates } from '$/hooks/latte/useLatteThreadUpdates'

export const LatteRealtimeUpdatesProvider = memo(
  ({ children }: { children: ReactNode }) => {
    useLatteThreadUpdates()
    useLatteProjectChanges()

    return children
  },
)
