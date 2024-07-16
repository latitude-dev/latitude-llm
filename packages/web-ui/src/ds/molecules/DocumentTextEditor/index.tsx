'use client'

import React, { lazy } from 'react'

import type { ConversationMetadata } from '@latitude-data/compiler'

import { DocumentTextEditorFallback } from './fallback'

export type DocumentTextEditorProps = {
  value: string
  metadata?: ConversationMetadata
  onChange?: (value: string) => void
  disabled?: boolean
}

const DocumentTextEditor = lazy(() =>
  import('./editor').then(
    (module) =>
      ({ default: module.DocumentTextEditor }) as {
        default: React.ComponentType<DocumentTextEditorProps>
      },
  ),
)

function EditorWrapper(props: DocumentTextEditorProps) {
  // When imported, Monaco automatically tries to use the window object.
  // Since this is not available when rendering on the server, we only
  // render the fallback component for SSR.
  if (typeof window === 'undefined') return <DocumentTextEditorFallback />
  return <DocumentTextEditor {...props} />
}

export { EditorWrapper as DocumentTextEditor, DocumentTextEditorFallback }
