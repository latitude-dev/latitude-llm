'use client'

import React, { lazy } from 'react'

import { ClientOnly } from '../../atoms/ClientOnly'
import { TextEditorPlaceholder } from '../TextEditorPlaceholder'
import { BlockRootNode } from './Editor/state/promptlToLexical/types'
import { BlocksEditorProps, IncludedPrompt } from './types'

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
  type BlockRootNode,
  type BlocksEditorProps,
  type IncludedPrompt,
}
