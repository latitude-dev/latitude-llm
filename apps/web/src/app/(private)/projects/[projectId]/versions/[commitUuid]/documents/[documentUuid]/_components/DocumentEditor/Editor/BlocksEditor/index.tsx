import { memo, Suspense } from 'react'
import { AstError } from '@latitude-data/constants/simpleBlocks'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { AnyBlock } from '@latitude-data/constants/simpleBlocks'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'

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
        Blocks Editor
        <CodeBlock language='json'>{JSON.stringify(blocks, null, 2)}</CodeBlock>
      </Suspense>
    )
  },
)
