import { memo, Suspense, useCallback } from 'react'
import Link from 'next/link'
import { AstError, AnyBlock } from '@latitude-data/constants/simpleBlocks'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import {
  BlocksEditor,
  IncludedPrompt,
} from '@latitude-data/web-ui/molecules/BlocksEditor'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'
import { type DocumentVersion } from '@latitude-data/core/browser'
import { useIncludabledPrompts } from './useIncludabledPrompts'
import { scan } from 'promptl-ai'
import useDocumentVersions from '$/stores/documentVersions'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'

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
    project,
    commit,
    document,
    onToggleBlocksEditor,
    value: _prompt,
  }: {
    project: IProjectContextType['project']
    commit: ICommitContextType['commit']
    document: DocumentVersion
    compileErrors: AstError[] | undefined
    blocks: AnyBlock[] | undefined
    value: string
    defaultValue?: string
    isSaved: boolean
    readOnlyMessage?: string
    onToggleBlocksEditor: ReactStateDispatch<boolean>
    onChange: (value: string) => void
  }) => {
    const { data: documents } = useDocumentVersions({
      commitUuid: commit?.uuid,
      projectId: project?.id,
    })
    const prompts = useIncludabledPrompts({
      project,
      commit,
      document,
      documents,
    })
    // const blocksToRender = blocks.length > 0 ? blocks : exampleBlocks

    const handleBlocksChange = (_updatedBlocks: AnyBlock[]) => {
      // Convert blocks back to string format if needed
      // For now, we'll just stringify the blocks
      // onChange(JSON.stringify(updatedBlocks, null, 2))
    }
    const onRequestPromptMetadata = useCallback(
      async ({ id }: IncludedPrompt) => {
        const prompt = documents.find((doc) => doc.id === id)
        return await scan({ prompt: prompt!.content })
      },
      [documents],
    )
    const onToogleDevEditor = useCallback(() => {
      onToggleBlocksEditor(false)
    }, [onToggleBlocksEditor])
    return (
      <Suspense fallback={<TextEditorPlaceholder />}>
        <BlocksEditor
          autoFocus
          readOnly={false}
          prompts={prompts}
          initialValue={exampleBlocks}
          Link={Link}
          onRequestPromptMetadata={onRequestPromptMetadata}
          onToggleDevEditor={onToogleDevEditor}
          onBlocksChange={handleBlocksChange}
          placeholder='Write your prompt, type "/" to insert messages or steps, "@" for include other prompts, "{{" for variables, Try typing "{{my_variable}}"'
        />
      </Suspense>
    )
  },
)
