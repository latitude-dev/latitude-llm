import { ErrorMessage, MessageList } from '$/components/ChatWrapper'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import { AgentToolsMap } from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useMemo } from 'react'
import Actions, { ActionsState } from './Actions'

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

  return (
    <div className='w-full flex flex-col flex-1'>
      {showHeader && (
        <Header
          expandParameters={expandParameters}
          setExpandParameters={setExpandParameters}
        />
      )}

      <Messages
        playground={playground}
        parameterKeys={parameterKeys}
        expandParameters={expandParameters ?? true} // by default, we show the parameters
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
    <div className='flex flex-col gap-3 flex-grow flex-shrink min-h-0'>
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
