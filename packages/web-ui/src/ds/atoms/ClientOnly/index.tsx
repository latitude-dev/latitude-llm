'use client'

import { ReactNode, useEffect, useState } from 'react'

export function ClientOnly({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Avoid rendering inputs on server
  // We have a Hydration issue with the inputs because
  // they come from localStorage and are not available on the server
  if (!mounted) return null
  if (!className) return <>{children}</>

  return <div className={className}>{children}</div>
}
