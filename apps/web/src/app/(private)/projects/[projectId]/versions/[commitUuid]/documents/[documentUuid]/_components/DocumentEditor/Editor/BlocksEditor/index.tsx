import { memo, useState, Suspense, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { AstError } from '@latitude-data/constants/promptl'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { Text } from '@latitude-data/web-ui/atoms/Text'
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
    rootBlock: defaultRootBlock,
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

    const onError = useCallback(
      (error: Error) => {
        toast({
          variant: 'destructive',
          title: 'Error during edition',
          description: error.message,
        })
      },
      [toast],
    )

    const isMounted = useRef(false)
    const [initialValue, setInitialValue] = useState<BlockRootNode | undefined>(
      defaultRootBlock,
    )

    useEffect(() => {
      if (isMounted.current) return
      if (!defaultRootBlock) return

      setInitialValue(defaultRootBlock)
      isMounted.current = true
    }, [defaultRootBlock])

    // FIXME: How to refresh the Lexical editor when Promptl errors are introduced or fixed
    // The thing is that Lexical manage his own state and we can not be passing new state whenever
    // we save it in the DB because it will be raise conditions and the state will do weird things.
    // But the problem with this approach of never updating the `initialValue` is that I don't know how to
    // refresh the editor when the Promptl errors are fixed or introduced.
    return (
      <Suspense fallback={<TextEditorPlaceholder />}>
        {initialValue ? (
          <BlocksEditor
            initialValue={initialValue}
            currentDocument={document}
            prompts={prompts}
            onError={onError}
            Link={Link}
            onRequestPromptMetadata={onRequestPromptMetadata}
            onToggleDevEditor={onToogleDevEditor}
            onChange={onChange}
            readOnly={!!readOnlyMessage}
            placeholder='Write your prompt, type "/" to insert messages or steps, "@" for include other prompts, "{{" for variables, Try typing "{{my_variable}}"'
          />
        ) : (
          <Text.H6>Loading....</Text.H6>
        )}
      </Suspense>
    )
  },
)
