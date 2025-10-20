import { ErrorMessage, MessageList } from '$/components/ChatWrapper'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import { memo, useMemo } from 'react'
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
        messages={playground.messages}
        error={playground.error}
        parameterKeys={parameterKeys}
        expandParameters={expandParameters ?? true} // by default, we show the parameters
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

const Messages = memo(function Messages({
  messages,
  error,
  parameterKeys,
  expandParameters,
  toolContentMap,
}: {
  messages: ReturnType<typeof usePlaygroundChat>['messages']
  error: ReturnType<typeof usePlaygroundChat>['error']
  parameterKeys: string[]
  expandParameters: boolean
  toolContentMap: ReturnType<typeof useToolContentMap>
}) {
  return (
    <div className='flex flex-col gap-3 flex-grow flex-shrink min-h-0'>
      <MessageList
        messages={messages}
        parameters={parameterKeys}
        collapseParameters={!expandParameters}
        toolContentMap={toolContentMap}
      />

      {error && <ErrorMessage error={error} />}
    </div>
  )
})
