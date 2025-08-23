'use client'

import { submitToolResultAction } from '$/actions/tools/results/submit'
import { useFormAction } from '$/hooks/useFormAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import {
  AGENT_TOOL_PREFIX,
  type AgentToolsMap,
  LATITUDE_TOOL_PREFIX,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import type { ToolContent, ToolRequestContent } from '@latitude-data/constants/legacyCompiler'
import type { CodeToolArgs } from '@latitude-data/core/services/latitudeTools/runCode/types'
import type { ExtractToolArgs } from '@latitude-data/core/services/latitudeTools/webExtract/types'
import type { SearchToolArgs } from '@latitude-data/core/services/latitudeTools/webSearch/types'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Label } from '@latitude-data/web-ui/atoms/Label'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import type { ToolCallContent as PromptlToolCall } from 'promptl-ai'
import { type KeyboardEventHandler, useCallback, useState } from 'react'
import { ContentCard } from './ContentCard'
import { CodeLatitudeToolCallContent } from './LatitudeTools/Code'
import { WebExtractLatitudeToolCallContent } from './LatitudeTools/Extract'
import { WebSearchLatitudeToolCallContent } from './LatitudeTools/Search'
import { LatitudeToolCallContent } from './LatitudeTools/SubAgent'
import { ToolResultContent, ToolResultFooter } from './ToolResult'

function toolArgs(value: ToolRequestContent | PromptlToolCall): Record<string, unknown> {
  if ('args' in value) return value.args
  if ('toolArguments' in value) return value.toolArguments
  return {}
}

export function ToolCallContent({
  value,
  agentToolsMap,
  toolContentMap,
}: {
  value: ToolRequestContent
  agentToolsMap?: AgentToolsMap
  toolContentMap?: Record<string, ToolContent>
}) {
  const toolResponse = toolContentMap?.[value.toolCallId]
  const args = toolArgs(value)

  if (value.toolName === LatitudeToolInternalName.RunCode) {
    return (
      <CodeLatitudeToolCallContent
        toolCallId={value.toolCallId}
        args={args as CodeToolArgs}
        toolResponse={toolResponse}
      />
    )
  }

  if (value.toolName === LatitudeToolInternalName.WebSearch) {
    return (
      <WebSearchLatitudeToolCallContent
        toolCallId={value.toolCallId}
        args={args as SearchToolArgs}
        toolResponse={toolResponse}
      />
    )
  }

  if (value.toolName === LatitudeToolInternalName.WebExtract) {
    return (
      <WebExtractLatitudeToolCallContent
        toolCallId={value.toolCallId}
        args={args as ExtractToolArgs}
        toolResponse={toolResponse}
      />
    )
  }

  if (
    value.toolName.startsWith(AGENT_TOOL_PREFIX) ||
    value.toolName.startsWith(LATITUDE_TOOL_PREFIX)
  ) {
    return (
      <LatitudeToolCallContent
        toolCallId={value.toolCallId}
        toolName={value.toolName}
        args={args}
        agentToolsMap={agentToolsMap}
        toolResponse={toolResponse}
      />
    )
  }

  return <ClientToolCallContent value={value} toolResponse={toolResponse} args={args} />
}

function ClientToolCallContent({
  value,
  toolResponse,
  args,
}: {
  value: ToolRequestContent
  toolResponse?: ToolContent
  args?: Record<string, unknown>
}) {
  const codeBlockValue = `${value.toolName}(${JSON.stringify(args, null, 2)})`

  return (
    <ContentCard
      label='Tool requested'
      icon='puzzle'
      bgColor='bg-yellow'
      fgColor='warningForeground'
      info={value.toolCallId}
      infoColor='warningMutedForeground'
      resultFooter={
        <ToolResultFooter>
          {toolResponse && <ToolResultContent toolResponse={toolResponse} />}
        </ToolResultFooter>
      }
      separatorColor={toolResponse?.isError ? 'destructiveMutedForeground' : undefined}
    >
      <CodeBlock language='javascript'>{codeBlockValue}</CodeBlock>
      {!toolResponse && <ToolEditor toolCallId={value.toolCallId} />}
    </ContentCard>
  )
}

function ToolEditor({ toolCallId }: { toolCallId: string }) {
  const [value, setValue] = useState<string>('')
  const { execute, isPending } = useLatitudeAction(submitToolResultAction, {
    onSuccess: () => {}, // Note: overriding onSuccess to mute success toast
  })
  const { action } = useFormAction(execute)
  const onKeyUp = useCallback(
    (event) => {
      // cmd + enter
      if (event.ctrlKey && event.key === 'Enter' && value) {
        execute({ toolCallId, result: value, isError: false })
      }
    },
    [value, execute, toolCallId],
  ) as KeyboardEventHandler<HTMLTextAreaElement | HTMLDivElement>

  return (
    <form action={action} className='p-4 flex flex-col gap-2'>
      <Input name='toolCallId' value={toolCallId} type='hidden' />
      <Label>Your tool response</Label>
      <TextArea
        name='result'
        value={value}
        onKeyUp={onKeyUp}
        onChange={(ev) => setValue(ev.target.value)}
      />
      <div className='flex items-center justify-end'>
        <Button fancy disabled={isPending} type='submit'>
          Submit
        </Button>
      </div>
    </form>
  )
}
