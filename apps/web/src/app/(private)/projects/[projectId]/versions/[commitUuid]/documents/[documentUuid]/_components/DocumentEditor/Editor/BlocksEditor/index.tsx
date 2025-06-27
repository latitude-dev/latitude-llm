import { memo, Suspense } from 'react'
import { AstError, AnyBlock } from '@latitude-data/constants/simpleBlocks'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { BlocksEditor } from '@latitude-data/web-ui/molecules/BlocksEditor'

// Example blocks to demonstrate the editor
const exampleBlocks: AnyBlock[] = [
  {
    id: 'block_1',
    type: 'text',
    content: 'This is a simple text block with some content.',
  },
  {
    id: 'block_2',
    type: 'system',
    children: [],
  },
  {
    id: 'block_3',
    type: 'user',
    children: [
      {
        id: 'msg_child_2',
        type: 'text',
        content: 'Hello! Can you help me with a question?',
      },
    ],
  },
  {
    id: 'block_4',
    type: 'assistant',
    children: [
      {
        id: 'msg_child_4',
        type: 'text',
        content: "Of course! I'd be happy to help you. What's your question?",
      },
    ],
  },
  {
    id: 'block_5',
    type: 'step',
    children: [
      {
        id: 'step_child_1',
        type: 'user',
        children: [
          {
            id: 'step_msg_1',
            type: 'text',
            content: 'Please analyze this data.',
          },
        ],
      },
    ],
    attributes: {
      as: 'data_analysis',
      isolated: true,
    },
  },
]

export const PlaygroundBlocksEditor = memo(
  ({
    value: _prompt,
  }: {
    compileErrors: AstError[] | undefined
    blocks: AnyBlock[] | undefined
    value: string
    defaultValue?: string
    isSaved: boolean
    readOnlyMessage?: string
    onChange: (value: string) => void
  }) => {
    // const blocksToRender = blocks.length > 0 ? blocks : exampleBlocks

    const handleBlocksChange = (_updatedBlocks: AnyBlock[]) => {
      // Convert blocks back to string format if needed
      // For now, we'll just stringify the blocks
      // onChange(JSON.stringify(updatedBlocks, null, 2))
    }

    return (
      <Suspense fallback={<TextEditorPlaceholder />}>
        <div className='space-y-4'>
          <div className='text-sm text-gray-600'>
            Blocks Editor Demo - {exampleBlocks.length} blocks loaded
          </div>
          <BlocksEditor
            autoFocus
            readOnly={false}
            initialValue={exampleBlocks}
            onBlocksChange={handleBlocksChange}
            placeholder='Edit your blocks here...'
          />
          <details className='text-xs'>
            <summary className='cursor-pointer text-gray-500'>
              Show raw blocks data
            </summary>
            <pre className='bg-gray-100 p-2 rounded mt-2 overflow-auto max-h-40'>
              {JSON.stringify(exampleBlocks, null, 2)}
            </pre>
          </details>
        </div>
      </Suspense>
    )
  },
)
