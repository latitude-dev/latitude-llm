'use client'

import type React from 'react'
import { lazy, useEffect, useState } from 'react'

import { TextEditorPlaceholder } from '../TextEditorPlaceholder'
import type { DiffValue } from '@latitude-data/core/browser'

const DiffViewer = lazy(() =>
  import('./Editor/index').then(
    (module) =>
      ({
        default: module.DiffViewer,
      }) as {
        default: React.ComponentType<DiffValue>
      },
  ),
)

function EditorWrapper(props: DiffValue) {
  // When imported, Monaco automatically tries to use the window object. Since
  // this is not available when rendering on the server, we only render the
  // fallback component for SSR.
  const [isBrowser, setIsBrowser] = useState(false)

  useEffect(() => {
    setIsBrowser(typeof window !== 'undefined')
  }, [])

  if (!isBrowser) {
    return <TextEditorPlaceholder />
  }

  return <DiffViewer {...props} />
}

export { EditorWrapper as DiffViewer }
