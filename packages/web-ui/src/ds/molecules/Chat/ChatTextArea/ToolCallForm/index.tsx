'use client'

import { MouseEvent, lazy, useState, useCallback, useMemo } from 'react'
import { ToolMessage, Message, ToolCall } from '@latitude-data/compiler'
import {
  Badge,
  Icon,
  Text,
  CodeBlock,
  Tooltip,
  ClientOnly,
} from '../../../../atoms'
import { ToolBar } from '../ToolBar'
import { buildResponseMessage } from '@latitude-data/constants'

const TextEditor = lazy(() => import('./Editor/index'))

function generateExampleFunctionCall(toolCall: ToolCall) {
  const args = toolCall.arguments
  const functionName = toolCall.name
  const formattedArgs =
    typeof args === 'object' && Object.keys(args).length
      ? JSON.stringify(args, null, 2)
      : ''

  return `${functionName}(${formattedArgs ? formattedArgs : ''})`
}

function buildToolResponseMessage({
  value,
  toolRequest,
}: {
  value: string
  toolRequest: ToolCall
}) {
  const toolResponse = {
    id: toolRequest.id,
    name: toolRequest.name,
    result: value,
  }
  const message = buildResponseMessage<'text'>({
    type: 'text',
    data: {
      text: undefined,
      toolCallResponses: [toolResponse],
    },
  })
  return message! as ToolMessage
}

function ToolEditor({
  value,
  toolRequest,
  onChange,
  onSubmit,
  placeholder,
  currentToolRequest,
  totalToolRequests,
}: {
  toolRequest: ToolCall
  placeholder: string
  value: string | undefined
  currentToolRequest: number
  totalToolRequests: number
  onChange: (value: string | undefined) => void
  onSubmit?: (sentValue?: string | undefined) => void
}) {
  const functionCall = useMemo(
    () => generateExampleFunctionCall(toolRequest),
    [toolRequest],
  )
  return (
    <div className='flex flex-col'>
      <div className='flex px-2 pt-2'>
        <Tooltip
          asChild
          trigger={
            <div className='inline-flex items-center gap-x-1 mb-2'>
              <Text.H6>
                You have{' '}
                {totalToolRequests <= 1 ? (
                  <>
                    <Badge variant='muted'>{totalToolRequests}</Badge> tool to
                    be responded
                  </>
                ) : (
                  <>
                    <Badge variant='muted'>{currentToolRequest}</Badge> of{' '}
                    <Badge variant='muted'>{totalToolRequests}</Badge> tools to
                    be responded
                  </>
                )}
              </Text.H6>
              <Icon name='info' color='foregroundMuted' />
            </div>
          }
        >
          The Assistant has responded with a Tool Request. In your server, this
          would mean to run the function from your code and send back the
          result. However, since we cannot access your code execution from the
          Playground, you must write the expected response when using this tool.
        </Tooltip>
      </div>
      <CodeBlock copy={false} language='javascript'>
        {functionCall}
      </CodeBlock>
      <hr className='my-1 border-foregroundMuted' />
      <div className='px-2 pb-2 relative'>
        <Text.H5M>Your tool response</Text.H5M>
        <TextEditor
          value={value}
          onChange={onChange}
          onCmdEnter={onSubmit}
          placeholder={placeholder}
        />
      </div>
    </div>
  )
}

function getValue(value: string | MouseEvent<HTMLButtonElement> | undefined) {
  if (typeof value === 'string') return value.trim()
  return undefined
}

export function ToolCallForm({
  toolRequests,
  sendToServer,
  addLocalMessages,
  clearChat,
  disabled,
  placeholder,
}: {
  toolRequests: ToolCall[]
  placeholder: string
  addLocalMessages: (messages: Message[]) => void
  sendToServer?: (messages: ToolMessage[]) => void
  clearChat?: () => void
  disabled?: boolean
}) {
  const [currentToolRequestIndex, setCurrentToolRequestIndex] = useState(1)
  const [currentToolRequest, setCurrentToolRequest] = useState<
    ToolCall | undefined
  >(toolRequests[0])
  const [respondedToolRequests, setRespondedToolRequests] = useState<
    ToolMessage[]
  >([])
  const [value, setValue] = useState<string | undefined>('')
  const onChange = useCallback((newValue: string | undefined) => {
    setValue(newValue)
  }, [])
  const onLocalSend = useCallback(
    (sentValue?: MouseEvent<HTMLButtonElement> | string | undefined) => {
      const cleanValue = getValue(value || sentValue)

      if (!currentToolRequest) return
      if (!cleanValue) return

      const message = buildToolResponseMessage({
        value: cleanValue,
        toolRequest: currentToolRequest,
      })
      setRespondedToolRequests((prev) => [...prev, message])
      addLocalMessages([message])
      const findNextToolRequest = toolRequests.findIndex(
        (tr) => tr.id === currentToolRequest.id,
      )
      const nextIndex = findNextToolRequest + 1
      const nextToolRequest = toolRequests[nextIndex]

      if (nextToolRequest) {
        setCurrentToolRequest(nextToolRequest)
        setCurrentToolRequestIndex(nextIndex)
      }
      setValue('')
    },
    [
      currentToolRequest,
      addLocalMessages,
      value,
      setCurrentToolRequest,
      setCurrentToolRequestIndex,
      setRespondedToolRequests,
      toolRequests,
    ],
  )

  const onServerSend = useCallback(
    (sentValue?: string | undefined) => {
      const cleanValue = getValue(value || sentValue)

      if (!currentToolRequest) return
      if (!cleanValue) return

      const message = buildToolResponseMessage({
        value: cleanValue,
        toolRequest: currentToolRequest,
      })
      addLocalMessages([message])
      const allToolMessages = respondedToolRequests.concat([message])
      sendToServer?.(allToolMessages)
    },
    [
      addLocalMessages,
      respondedToolRequests,
      sendToServer,
      currentToolRequest,
      value,
    ],
  )

  if (!currentToolRequest) return null

  const isLastRequest =
    currentToolRequest.id === toolRequests[toolRequests.length - 1]?.id

  const onSubmitHandler = isLastRequest ? onServerSend : onLocalSend

  return (
    <ClientOnly className='flex flex-col w-full pb-14'>
      <ToolEditor
        placeholder={placeholder}
        value={value}
        toolRequest={currentToolRequest}
        onChange={onChange}
        onSubmit={onSubmitHandler}
        currentToolRequest={currentToolRequestIndex}
        totalToolRequests={toolRequests.length}
      />
      <div className='absolute bottom-4 right-4'>
        <ToolBar
          disabled={disabled ?? getValue(value) === ''}
          clearChat={clearChat}
          onSubmit={onSubmitHandler}
          submitLabel='Send tool response'
        />
      </div>
    </ClientOnly>
  )
}
