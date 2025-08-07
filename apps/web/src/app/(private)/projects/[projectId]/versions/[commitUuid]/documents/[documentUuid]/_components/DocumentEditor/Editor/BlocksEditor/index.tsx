import useDocumentVersions from '$/stores/documentVersions'
import { type DocumentVersion } from '@latitude-data/core/browser'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
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
import { memo, Suspense, useCallback } from 'react'
import { stringify as stringifyObjectToYaml } from 'yaml'
import { useDevMode } from '../hooks/useDevMode'
import { useIncludabledPrompts } from './useIncludabledPrompts'

export const PlaygroundBlocksEditor = memo(
  ({
    project,
    commit,
    document,
    rootBlock,
    readOnlyMessage,
    onChange,
    config,
  }: {
    project: IProjectContextType['project']
    commit: ICommitContextType['commit']
    document: DocumentVersion
    rootBlock: BlockRootNode
    config?: Config
    readOnlyMessage?: string
    onChange: (value: string) => void
  }) => {
    const { toast } = useToast()
    const { setDevMode } = useDevMode()
    const toggleDevEditor = useCallback(() => {
      setDevMode(true)
    }, [setDevMode])
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
        // TODO: call web worker instead, we implemented web workers for a reason!
        return await scan({ prompt: prompt!.content })
      },
      [documents],
    )
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
    /*
     * We don't touch Promptl config on Blocks editor atm
     * So we restore the latest config from the document when a change
     * happens
     */
    const onChangePrompt = useCallback(
      (value: string) => {
        if (commit.mergedAt !== null) return
        if (!config) {
          onChange(value)
        } else {
          const frontMatter = stringifyObjectToYaml(config).trim()
          onChange(`---\n${frontMatter}\n---\n\n${value}\n`)
        }
      },
      [config, onChange, commit],
    )

    // FIXME: How to refresh the Lexical editor when Promptl errors are introduced or fixed
    // The thing is that Lexical manage his own state and we can not be passing new state whenever
    // we save it in the DB because it will be raise conditions and the state will do weird things.
    // But the problem with this approach of never updating the `initialValue`
    return (
      <Suspense fallback={<TextEditorPlaceholder />}>
        {rootBlock ? (
          <BlocksEditor
            initialValue={rootBlock}
            currentDocument={document}
            prompts={prompts}
            onError={onError}
            Link={Link}
            onRequestPromptMetadata={onRequestPromptMetadata}
            onToggleDevEditor={toggleDevEditor}
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
