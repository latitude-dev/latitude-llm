'use client'

import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import React, { lazy, useEffect, useState } from 'react'
import { BlockRootNode } from './Editor/state/promptlToLexical/types'
import { BlocksEditorProps, IncludedPrompt } from './types'

const BlocksEditor = lazy(() =>
  import('./Editor/index').then(
    (module) =>
      ({
        default: module.BlocksEditor,
      }) as {
        default: React.ComponentType<BlocksEditorProps>
      },
  ),
)

function BlocksEditorPlaceholder() {
  return (
    <Skeleton className='w-full h-full rounded-lg flex items-center justify-center gap-2 p-4'>
      <Icon name='loader' color='foregroundMuted' className='animate-spin' />
      <Text.H5 color='foregroundMuted'>Assembling prompt</Text.H5>
    </Skeleton>
  )
}

function EditorWrapper(props: BlocksEditorProps) {
  const [isBrowser, setIsBrowser] = useState(false)

  useEffect(() => {
    setIsBrowser(typeof window !== 'undefined')
  }, [])

  if (!isBrowser) {
    return <BlocksEditorPlaceholder />
  }

  return <BlocksEditor {...props} />
}

export {
  EditorWrapper as BlocksEditor,
  BlocksEditorPlaceholder,
  type BlockRootNode,
  type BlocksEditorProps,
  type IncludedPrompt,
}
