import { memo, useState, Suspense, useCallback, useEffect, useRef } from 'react'
import { stringify as stringifyObjectToYaml } from 'yaml'
import Link from 'next/link'
import { AstError } from '@latitude-data/constants/promptl'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { scan, Config } from 'promptl-ai'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
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
    config,
  }: {
    project: IProjectContextType['project']
    commit: ICommitContextType['commit']
    document: DocumentVersion
    compileErrors: AstError[] | undefined
    rootBlock?: BlockRootNode
    config?: Config
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

    /*
     * We don't touch Promptl config on Blocks editor atm
     * So we restore the latest config from the document when a change
     * happens
     */
    const onChangePrompt = useCallback(
      (value: string) => {
        if (!config) {
          onChange(value)
        }

        const frontMatter = stringifyObjectToYaml(config)
        onChange(`---\n${frontMatter}\n---\n${value}`)
      },
      [config, onChange],
    )

    // FIXME: How to refresh the Lexical editor when Promptl errors are introduced or fixed
    // The thing is that Lexical manage his own state and we can not be passing new state whenever
    // we save it in the DB because it will be raise conditions and the state will do weird things.
    // But the problem with this approach of never updating the `initialValue`
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
            onChange={onChangePrompt}
            readOnlyMessage={readOnlyMessage}
            placeholder='Type your instructions here, use / for commands'
          />
        ) : (
          <div
            className={cn('flex items-center justify-center h-full', {
              'border border-border bg-backgroundCode rounded-md px-3':
                !!readOnlyMessage,
            })}
          >
            <Text.H6 color='foregroundMuted'>Loading prompt....</Text.H6>
          </div>
        )}
      </Suspense>
    )
  },
)
