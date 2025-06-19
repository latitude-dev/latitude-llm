import { memo, Suspense, useState } from 'react'
import { AstError } from '@latitude-data/constants/simpleBlocks'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { AnyBlock } from '@latitude-data/constants/simpleBlocks'
import {
  type JSONContent,
  BlocksEditor,
} from '@latitude-data/web-ui/molecules/BlocksEditor'

export const PlaygroundBlocksEditor = memo(
  ({
    value: _prompt,
    blocks = [],
  }: {
    compileErrors: AstError[] | undefined
    blocks: AnyBlock[] | undefined
    value: string
    defaultValue?: string
    isSaved: boolean
    readOnlyMessage?: string
    onChange: (value: string) => void
  }) => {
    // if (!blocks.length) return null

    const [localBlocks, setLocalBlocks] = useState<JSONContent[]>([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Hola',
          },
        ],
      },
    ])

    console.log('LOCAL_BLOCKS', localBlocks)

    return (
      <Suspense fallback={<TextEditorPlaceholder />}>
        <BlocksEditor
          content={localBlocks}
          onUpdate={setLocalBlocks}
          placeholder='Write your prompt, type "/" to add blocks.'
        />
      </Suspense>
    )
  },
)
