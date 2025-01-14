'use client'

import { lazy, useState, useCallback, useMemo } from 'react'
import { ToolCall } from '@latitude-data/compiler'
import { cn } from '../../../../../lib/utils'
import {
  Text,
  Button,
  CodeBlock,
  useCodeBlockBackgroundColor,
  ClientOnly,
} from '../../../../atoms'
import { OnToolCallActionFn } from '../../types'

const TextEditor = lazy(() => import('./Editor/index'))

function generateExampleFunctionCall(toolCall: ToolCall) {
  const args = toolCall.arguments
  const functionName = toolCall.name
  const formattedArgs = Object.keys(args).length
    ? JSON.stringify(args, null, 2)
    : ''

  return `${functionName}(${formattedArgs ? formattedArgs : ''})`
}

export function ToolCallForm({
  toolCall,
  documentLogUuid,
  addToolResponse,
}: {
  toolCall: ToolCall
  addToolResponse: OnToolCallActionFn
  documentLogUuid: string
}) {
  const functionCall = useMemo(
    () => generateExampleFunctionCall(toolCall),
    [toolCall],
  )
  const bgColor = useCodeBlockBackgroundColor()
  const [value, setValue] = useState<string | undefined>(' ')
  const onChange = useCallback((newValue: string | undefined) => {
    setValue(newValue)
  }, [])
  const onClick = useCallback(
    (val: string | undefined) => () => {
      if (!val) return // Don't save empty responses

      addToolResponse({
        documentLogUuid,
        toolCallResponse: {
          id: toolCall.id,
          name: toolCall.name,
          result: val,
        },
      })
    },
    [documentLogUuid, addToolResponse, toolCall],
  )
  return (
    <ClientOnly>
      <div
        className={cn('py-2 max-w-full overflow-hidden rounded-xl', bgColor)}
      >
        <CodeBlock copy={false} language='javascript'>
          {functionCall}
        </CodeBlock>
        <hr className='my-1 border-foregroundMuted' />
        <div className='px-2 pb-2 relative'>
          <Text.H6M>Tool Call Response:</Text.H6M>
          <TextEditor value={value} onChange={onChange} />
          {value ? (
            <div className='absolute right-4 bottom-0'>
              <Button
                fancy
                size='small'
                variant='outline'
                onClick={onClick(value)}
              >
                Save response
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </ClientOnly>
  )
}
