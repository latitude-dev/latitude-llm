'use client'

import { useLatteProjectChanges, useLatteThreadUpdates } from '$/hooks/latte'
import { memo, type ReactNode } from 'react'

export const LatteRealtimeUpdatesProvider = memo(({ children }: { children: ReactNode }) => {
  useLatteThreadUpdates()
  useLatteProjectChanges()

  return children
})
