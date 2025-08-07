'use client'

import type React from 'react'
import { lazy } from 'react'

import { TextEditorPlaceholder } from '../TextEditorPlaceholder'
import type { BlocksEditorProps, IncludedPrompt } from './types'
import type { BlockRootNode } from './Editor/state/promptlToLexical/types'
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
  type IncludedPrompt,
  type BlocksEditorProps,
  type BlockRootNode,
}
