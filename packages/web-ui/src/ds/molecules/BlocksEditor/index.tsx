'use client'

import React, { lazy } from 'react'

import { TextEditorPlaceholder } from '../TextEditorPlaceholder'
import { BlocksEditorProps, JSONContent } from './types'
import { ClientOnly } from '../../atoms/ClientOnly'

const LazyBlocksEditor = lazy(() =>
  import('./Editor/index').then(
    (module) =>
      ({
        default: module.BlocksEditor,
      }) as {
        default: React.ComponentType<BlocksEditorProps>
      },
  ),
)

function EditorWrapper(props: BlocksEditorProps) {
  return (
    <ClientOnly>
      <LazyBlocksEditor {...props} />
    </ClientOnly>
  )
}

export {
  EditorWrapper as BlocksEditor,
  TextEditorPlaceholder,
  type JSONContent,
}
