'use client'

import React, { lazy, ReactNode, useEffect, useState } from 'react'

type MeshGradientProps = {
  className?: string
  children?: ReactNode
}

const ClientMeshGradient = lazy(() =>
  import('./ClientMeshGradient').then(
    (module) =>
      ({
        default: module.ClientMeshGradient,
      }) as {
        default: React.ComponentType<MeshGradientProps>
      },
  ),
)

export function MeshGradient({ className, children }: MeshGradientProps) {
  const [isBrowser, setIsBrowser] = useState(false)

  useEffect(() => {
    setIsBrowser(typeof window !== 'undefined')
  }, [])

  if (!isBrowser) {
    return <div className={className}>{children}</div>
  }

  return (
    <ClientMeshGradient className={className}>{children}</ClientMeshGradient>
  )
}
