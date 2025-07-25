import useDocumentVersions from '$/stores/documentVersions'
import { AstError } from '@latitude-data/constants/promptl'
import { type DocumentVersion } from '@latitude-data/core/browser'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import {
  type BlockRootNode,
  BlocksEditor,
  IncludedPrompt,
} from '@latitude-data/web-ui/molecules/BlocksEditor'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'
import Link from 'next/link'
import { Config, scan } from 'promptl-ai'
import { memo, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { stringify as stringifyObjectToYaml } from 'yaml'
import { useIncludabledPrompts } from './useIncludabledPrompts'

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
    const onToggleDevEditor = useCallback(() => {
      onToggleBlocksEditor(true)
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

        const frontMatter = stringifyObjectToYaml(config).trim()
        onChange(`---\n${frontMatter}\n---\n\n${value}\n`)
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
            onToggleDevEditor={onToggleDevEditor}
            onChange={onChangePrompt}
            readOnlyMessage={readOnlyMessage}
            placeholder='Type your instructions here, use / for commands'
          />
        ) : (
          <Skeleton className='w-full h-full rounded-lg flex items-center justify-center gap-2 p-4'>
            <Icon
              name='loader'
              color='foregroundMuted'
              className='animate-spin'
            />
            <Text.H5 color='foregroundMuted'>Assembling prompt</Text.H5>
          </Skeleton>
        )}
      </Suspense>
    )
  },
)
