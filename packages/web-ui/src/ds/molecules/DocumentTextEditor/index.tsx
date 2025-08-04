'use client'

import React, { lazy, useEffect, useState } from 'react'
import { TextEditorPlaceholder } from '../TextEditorPlaceholder'
import { EditorReadOnlyBanner } from './ReadOnlyMessage'
import { DocumentTextEditorProps } from './types'

const DocumentTextEditor = lazy(() =>
  import('./Editor/index').then(
    (module) =>
      ({
        default: module.DocumentTextEditor,
      }) as {
        default: React.ComponentType<DocumentTextEditorProps>
      },
  ),
)

function EditorWrapper(props: DocumentTextEditorProps) {
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

  return <DocumentTextEditor {...props} />
}

export {
  EditorWrapper as DocumentTextEditor,
  EditorReadOnlyBanner,
  TextEditorPlaceholder,
  type DocumentTextEditorProps,
}
