import { memo, Suspense } from 'react'
import { AstError } from '@latitude-data/constants/simpleBlocks'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { AnyBlock } from '@latitude-data/constants/simpleBlocks'
import { BlocksEditor } from '@latitude-data/web-ui/molecules/BlocksEditor'

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
    if (!blocks.length) return null

    return (
      <Suspense fallback={<TextEditorPlaceholder />}>
        <BlocksEditor
          blocks={blocks}
          onUpdate={() => {}}
          placeholder='Write your prompt'
        />
      </Suspense>
    )
  },
)
