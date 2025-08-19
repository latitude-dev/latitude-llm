import React, { useEffect, useMemo, useRef } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'

import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import Actions, { ActionsState } from './Actions'
import { AgentToolsMap } from '@latitude-data/constants'
import { ErrorMessage, MessageList } from '$/components/ChatWrapper'

export default function Chat({
  expandParameters,
  parameters,
  playground,
  setExpandParameters,
  showHeader,
}: {
  parameters: Record<string, unknown> | undefined
  playground: ReturnType<typeof usePlaygroundChat>
  showHeader: boolean
} & ActionsState) {
  const runOnce = useRef(false)
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { data: agentToolsMap } = useAgentToolsMap({
    commitUuid: commit.uuid,
    projectId: project.id,
  })

  const toolContentMap = useToolContentMap(playground.messages)
  const parameterKeys = useMemo(
    () => Object.keys(parameters ?? {}),
    [parameters],
  )

  // FIXME: Do not run side effects on useEffect. Move to event handler.
  useEffect(() => {
    if (!runOnce.current) {
      runOnce.current = true
      playground.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playground.start])

  return (
    <div className='flex flex-col flex-1 h-full overflow-hidden'>
      {showHeader && (
        <Header
          expandParameters={expandParameters}
          setExpandParameters={setExpandParameters}
        />
      )}

      <Messages
        playground={playground}
        parameterKeys={parameterKeys}
        expandParameters={expandParameters}
        agentToolsMap={agentToolsMap}
        toolContentMap={toolContentMap}
      />
    </div>
  )
}

function Header({ expandParameters, setExpandParameters }: ActionsState) {
  return (
    <div className='flex flex-row items-center justify-between w-full pb-3'>
      <Text.H6M>Prompt</Text.H6M>
      <Actions
        expandParameters={expandParameters}
        setExpandParameters={setExpandParameters}
      />
    </div>
  )
}

function Messages({
  playground,
  parameterKeys,
  expandParameters,
  agentToolsMap,
  toolContentMap,
}: {
  playground: ReturnType<typeof usePlaygroundChat>
  parameterKeys: string[]
  expandParameters: boolean
  agentToolsMap: AgentToolsMap
  toolContentMap: ReturnType<typeof useToolContentMap>
}) {
  return (
    <div className='flex flex-col gap-3 flex-grow flex-shrink min-h-0 pb-12'>
      <MessageList
        messages={playground.messages}
        parameters={parameterKeys}
        collapseParameters={!expandParameters}
        agentToolsMap={agentToolsMap}
        toolContentMap={toolContentMap}
      />

      {playground.error && <ErrorMessage error={playground.error} />}
    </div>
  )
}
