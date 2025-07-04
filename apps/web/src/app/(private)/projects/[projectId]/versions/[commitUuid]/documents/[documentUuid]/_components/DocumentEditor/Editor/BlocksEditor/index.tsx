import { memo, Suspense, useCallback } from 'react'
import Link from 'next/link'
import { AstError } from '@latitude-data/constants/promptl'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import {
  type BlockRootNode,
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

export const PlaygroundBlocksEditor = memo(
  ({
    project,
    commit,
    document,
    rootBlock,
    onToggleBlocksEditor,
    readOnlyMessage,
    onChange,
  }: {
    project: IProjectContextType['project']
    commit: ICommitContextType['commit']
    document: DocumentVersion
    compileErrors: AstError[] | undefined
    rootBlock?: BlockRootNode
    value: string
    isSaved: boolean
    readOnlyMessage?: string
    onToggleBlocksEditor: ReactStateDispatch<boolean>
    onChange: (value: string) => void
  }) => {
    const { toast } = useToast()
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

    const onBlocksEditorError = useCallback(
      (error: Error) => {
        toast({
          variant: 'destructive',
          title: 'Error during edition',
          description: error.message,
        })
      },
      [toast],
    )

    return (
      <Suspense fallback={<TextEditorPlaceholder />}>
        {rootBlock ? (
          <BlocksEditor
            readOnly={!!readOnlyMessage}
            currentDocument={document}
            prompts={prompts}
            rootBlock={rootBlock}
            onError={onBlocksEditorError}
            Link={Link}
            onRequestPromptMetadata={onRequestPromptMetadata}
            onToggleDevEditor={onToogleDevEditor}
            onChange={onChange}
            placeholder='Write your prompt, type "/" to insert messages or steps, "@" for include other prompts, "{{" for variables, Try typing "{{my_variable}}"'
          />
        ) : (
          <TextEditorPlaceholder />
        )}
      </Suspense>
    )
  },
)
