import { memo, useCallback, useEffect, useState } from 'react'
import type { ConversationMetadata } from 'promptl-ai'
import { cn } from '@latitude-data/web-ui/utils'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import {
  PLAYGROUND_COLLAPSED_SIZE,
  PLAYGROUND_GAP_PADDING,
} from '$/hooks/playgrounds/constants'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useExpandParametersOrEvaluations } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/hooks/useExpandParametersOrEvaluations'
import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import { ROUTES } from '$/services/routes'
import PreviewPrompt from '$/components/PlaygroundCommon/PreviewPrompt'
import Chat from '$/components/PlaygroundCommon/Chat'

const FAKE_PARAMETERS = {}
export const Playground = memo(
  ({ metadata }: { metadata: ConversationMetadata }) => {
    const [mode, setMode] = useState<'preview' | 'chat'>('preview')
    const [forcedSize, setForcedSize] = useState<number | undefined>()
    const expander = useExpandParametersOrEvaluations({
      initialExpanded: 'parameters',
    })
    const collapsed = expander.expandedSection === null
    useEffect(() => {
      setForcedSize(collapsed ? PLAYGROUND_COLLAPSED_SIZE : undefined)
    }, [collapsed])
    const { value: expandParameters, setValue: setExpandParameters } =
      useLocalStorage({
        key: AppLocalStorage.expandParameters,
        defaultValue: false,
      })
    const clearChat = useCallback(() => setMode('preview'), [setMode])
    const runPrompt = useCallback(() => setMode('chat'), [setMode])
    const { createStreamHandler } = useStreamHandler()
    // TODO: Implement evaluation parameters
    const parameters = FAKE_PARAMETERS
    const runPromptFn = useCallback(async () => {
      try {
        // TODO: Implement evaluation run action
        const response = await fetch(
          ROUTES.api.documents.detail('foo-bar').run,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              path: 'no-path',
              projectId: 0,
              commitUuid: 'no-commit-uuid',
              parameters: parameters ?? {},
              stream: true, // Explicitly request streaming
            }),
          },
        )

        return createStreamHandler(response)
      } catch (error) {
        console.error('Error running prompt:', error)
        throw error
      }
    }, [parameters, createStreamHandler])

    return (
      <SplitPane
        direction='vertical'
        gap={4}
        initialPercentage={50}
        forcedSize={forcedSize}
        minSize={PLAYGROUND_COLLAPSED_SIZE + PLAYGROUND_GAP_PADDING}
        dragDisabled={collapsed}
        firstPane={
          <div
            className={cn('grid gap-2 w-full pr-0.5', expander.cssClass)}
          ></div>
        }
        secondPane={
          <div className='h-full flex-grow flex-shrink min-h-0 flex flex-col gap-2 overflow-hidden pr-0.5'>
            {mode === 'preview' ? (
              <PreviewPrompt
                metadata={metadata}
                parameters={parameters}
                runPrompt={runPrompt}
                expandParameters={expandParameters}
                setExpandParameters={setExpandParameters}
              />
            ) : (
              <Chat
                canChat={false}
                parameters={parameters}
                clearChat={clearChat}
                expandParameters={expandParameters}
                setExpandParameters={setExpandParameters}
                runPromptFn={runPromptFn}
              />
            )}
          </div>
        }
      />
    )
  },
)
