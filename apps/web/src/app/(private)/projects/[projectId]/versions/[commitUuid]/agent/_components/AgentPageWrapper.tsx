'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useRunDocument } from '../../documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/hooks/useRunDocument'
import { useCallback, useState } from 'react'
import { DocumentVersion } from '@latitude-data/core/schema/types'
import { MainAgentSection } from './MainSection'
import { AgentChatSection } from './ChatSection'
import { cn } from '@latitude-data/web-ui/utils'

export function AgentPageWrapper() {
  const { commit } = useCurrentCommit()

  const [parameters, setParameters] = useState<Record<string, unknown>>({})

  const { runDocument, addMessages, abortCurrentStream, hasActiveStream } =
    useRunDocument({
      commit,
    })

  const runPromptFn = useCallback(
    ({
      document,
      userMessage,
      parameters = {},
      aiParameters = false,
    }: {
      document: DocumentVersion
      parameters: Record<string, unknown>
      userMessage: string | undefined
      aiParameters: boolean
    }) =>
      runDocument({
        document,
        parameters,
        userMessage,
        aiParameters,
      }),
    [runDocument],
  )

  const playground = usePlaygroundChat({
    runPromptFn,
    addMessagesFn: addMessages,
    onPromptRan: (documentLogUuid, error) => {
      if (!documentLogUuid || error) return
    },
  })

  const onRunPrompt = useCallback(
    ({
      document,
      parameters,
      userMessage,
      aiParameters,
    }: {
      document: DocumentVersion
      parameters: Record<string, unknown>
      userMessage: string
      aiParameters: boolean
    }) => {
      setParameters(parameters)
      playground.start({ document, parameters, userMessage, aiParameters })
    },
    [playground, setParameters],
  )

  return (
    <div className='relative w-full h-full overflow-hidden'>
      <div
        className={cn(
          'absolute h-[200%] w-full grid grid-rows-2',
          'transition-transform duration-500 ',
          {
            '-translate-y-1/2': playground.mode === 'chat',
          },
        )}
      >
        <div
          className={cn('h-full transition-opacity duration-500', {
            'opacity-100': playground.mode === 'preview',
            'opacity-0': playground.mode === 'chat',
          })}
        >
          <MainAgentSection runPromptFn={onRunPrompt} />
        </div>
        <div
          className={cn('h-full transition-opacity duration-500', {
            'opacity-100': playground.mode === 'chat',
            'opacity-0': playground.mode === 'preview',
          })}
        >
          <AgentChatSection
            playground={playground}
            parameters={parameters}
            onClose={() => playground.reset()}
            abortCurrentStream={abortCurrentStream}
            hasActiveStream={hasActiveStream}
          />
        </div>
      </div>
    </div>
  )
}
