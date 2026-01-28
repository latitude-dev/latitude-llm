'use client'

import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useRunDocument } from '../../documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/hooks/useRunDocument'
import { useCallback, useState } from 'react'
import { MainAgentSection } from './MainSection'
import { AgentChatSection } from './ChatSection'
import { cn } from '@latitude-data/web-ui/utils'
import { RunProps } from '$/components/Agent/types'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

export function AgentPageWrapper({
  documents: serverDocuments,
}: {
  documents: DocumentVersion[]
}) {
  const { commit } = useCurrentCommit()

  const [parameters, setParameters] = useState<Record<string, unknown>>({})
  const [activeTrigger, setActiveTrigger] = useState<DocumentTrigger>()

  const { runDocument, addMessages, abortCurrentStream, hasActiveStream } =
    useRunDocument({
      commit,
    })

  const playground = usePlaygroundChat({
    runPromptFn: runDocument,
    addMessagesFn: addMessages,
    abortCurrentStream,
    onPromptRan: (documentLogUuid, error) => {
      if (!documentLogUuid || error) return
    },
  })

  const onRunPrompt = useCallback(
    ({
      trigger,
      document,
      parameters,
      userMessage,
      aiParameters,
    }: RunProps) => {
      setActiveTrigger(trigger)
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
          <MainAgentSection
            runPromptFn={onRunPrompt}
            serverDocuments={serverDocuments}
          />
        </div>
        <div
          className={cn('h-full transition-opacity duration-500', {
            'opacity-100': playground.mode === 'chat',
            'opacity-0': playground.mode === 'preview',
          })}
        >
          <AgentChatSection
            activeTrigger={activeTrigger}
            playground={playground}
            parameters={parameters}
            onClose={() => playground.reset()}
            hasActiveStream={hasActiveStream}
          />
        </div>
      </div>
    </div>
  )
}
