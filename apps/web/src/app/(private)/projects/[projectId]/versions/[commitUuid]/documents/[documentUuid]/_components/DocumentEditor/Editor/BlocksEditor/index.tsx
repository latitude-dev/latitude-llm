import {
  type BlockRootNode,
  BlocksEditor,
  BlocksEditorPlaceholder,
  IncludedPrompt,
} from '$/components/BlocksEditor'
import { useDevMode } from '$/hooks/useDevMode'
import { updateContentFn } from '$/hooks/useDocumentValueContext'
import { useEvents } from '$/lib/events'
import useDocumentVersions from '$/stores/documentVersions'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'
import { Config, scan } from 'promptl-ai'
import { memo, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { stringify as stringifyObjectToYaml } from 'yaml'
import { useIncludabledPrompts } from './useIncludabledPrompts'
import { type DocumentVersion } from '@latitude-data/core/schema/types'

export const PlaygroundBlocksEditor = memo(
  ({
    project,
    commit,
    document,
    defaultValue,
    readOnlyMessage,
    onChange,
    config,
  }: {
    project: IProjectContextType['project']
    commit: ICommitContextType['commit']
    document: DocumentVersion
    defaultValue?: BlockRootNode
    config?: Config
    readOnlyMessage?: string
    onChange: updateContentFn
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
    const onChangePrompt = useCallback(
      (value: string) => {
        if (commit.mergedAt) return
        if (config) {
          const frontMatter = stringifyObjectToYaml(config).trim()
          value = `---\n${frontMatter}\n---\n\n${value}\n`
        }

        onChange(value, { origin: 'blocksEditor' })
      },
      [config, onChange, commit],
    )

    // Note: Wait for, hopefully, the correct metadata to be set
    // this follows the same pattern as the provider model selector
    const [isInitialized, setInitialized] = useState(false)

    useEvents({
      onPromptMetadataChanged: ({ promptLoaded, metadata }) => {
        if (!promptLoaded || !metadata) return
        if (isInitialized) return
        setInitialized(true)
      },
    })

    // Note: Avoid setting the initial value more than once
    const once = useRef(false)
    const [initialValue, setInitialValue] = useState<BlockRootNode>()

    useEffect(() => {
      if (once.current) return
      if (!isInitialized) return
      if (!defaultValue) return
      once.current = true
      setInitialValue(defaultValue)
    }, [isInitialized, defaultValue])

    if (!isInitialized || !initialValue) {
      return <BlocksEditorPlaceholder />
    }

    return (
      <Suspense fallback={<BlocksEditorPlaceholder />}>
        <BlocksEditor
          initialValue={initialValue}
          currentDocument={document}
          project={project}
          commit={commit}
          document={document}
          prompts={prompts}
          onError={onError}
          onRequestPromptMetadata={onRequestPromptMetadata}
          onToggleDevEditor={toggleDevEditor}
          onChange={onChangePrompt}
          readOnlyMessage={readOnlyMessage}
          placeholder='Type your instructions here, use / for commands'
          autoFocus
        />
      </Suspense>
    )
  },
)
