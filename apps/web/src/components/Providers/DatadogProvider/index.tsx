'use client'

import { useEffect } from 'react'
import '$/instrumentation-client'

export function DatadogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // The actual DataDog RUM initialization happens in instrumentation-client.ts
    // This provider ensures it's loaded early in the app lifecycle
  }, [])

  return <>{children}</>
}
