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
  }: {
    compileErrors: AstError[] | undefined
    blocks: AnyBlock[] | undefined
    value: string
    defaultValue?: string
    isSaved: boolean
    readOnlyMessage?: string
    onChange: (value: string) => void
  }) => {
    const [localBlocks, setLocalBlocks] = useState<JSONContent[]>([
      {
        type: 'message',
        attrs: {
          role: 'system',
        },
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'This is my initial system message',
              },
            ],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Hi, I am {{ name }}, and I am also a system message',
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'prompt',
            attrs: {
              id: 'prompt-block-1',
              path: 'latitude-extract',
              attributes: {
                location: '{{thing}}',
              },
              // errors: [{ message: 'Path is required' }],
            },
          },
        ],
      },
      {
        type: 'step',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: "I'm inside a step",
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'prompt',
                attrs: {
                  id: 'prompt-block-2',
                  path: 'weather-prompt',
                },
              },
            ],
          },
          {
            type: 'message',
            attrs: {
              role: 'user',
            },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'What is the weather like in {{ location }}?',
                  },
                ],
              },
              {
                type: 'codeBlock',
                attrs: {
                  language: 'promptl',
                },
                content: [
                  {
                    type: 'text',
                    text: `{{for cities in ['Barcelona', 'Madrid']}}
  {{city}} is a city in Spain.
{{ endof }}`,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'message',
        attrs: {
          role: 'assistant',
        },
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Hello! How can I assist you today?',
              },
            ],
          },
        ],
      },
      {
        type: 'codeBlock',
        attrs: {
          language: 'promptl',
        },
        content: [
          {
            type: 'text',
            text: `{{if location == 'Barcelona'}}
  <step>
    <assistant>
      /* This is a comment */
      Is a sunny place with nice weather and good food. {{location}}
    </assistant>
  </step>
{{ endif }}`,
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
