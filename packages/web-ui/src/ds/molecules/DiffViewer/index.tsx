'use client'

import React, { lazy, useEffect, useState } from 'react'

import { SimpleDiffViewerFallback } from './fallback'
import { SimpleDiffViewerProps } from './types'

const DiffViewer = lazy(() =>
  import('./Editor/index').then(
    (module) =>
      ({
        default: module.DiffViewer,
      }) as {
        default: React.ComponentType<SimpleDiffViewerProps>
      },
  ),
)

function EditorWrapper(props: SimpleDiffViewerProps) {
  // When imported, Monaco automatically tries to use the window object. Since
  // this is not available when rendering on the server, we only render the
  // fallback component for SSR.
  const [isBrowser, setIsBrowser] = useState(false)

  useEffect(() => {
    setIsBrowser(typeof window !== 'undefined')
  }, [])

  if (!isBrowser) {
    return <SimpleDiffViewerFallback />
  }

  return <DiffViewer {...props} />
}

export { EditorWrapper as DiffViewer, SimpleDiffViewerFallback }
