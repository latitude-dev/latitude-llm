'use client'

import { ReactNode, useEffect, useState } from 'react'

export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Avoid rendering inputs on server
  // We have a Hydration issue with the inputs because
  // they come from localStorage and are not available on the server
  if (!mounted) return null

  return <>{children}</>
}
