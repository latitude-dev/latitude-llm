'use client'
import type {
  ExtractToolArgs,
  ExtractToolResult,
} from '@latitude-data/core/services/latitudeTools/webExtract/types'
import { useMemo, useState } from 'react'
import {
  ToolResultContent,
  ToolRequestContent,
} from '@latitude-data/constants/messages'
import { Markdown } from '@latitude-data/web-ui/atoms/Markdown'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  ToolCardIcon,
  ToolCardText,
  ToolCardWrapper,
  ToolCallStatus,
} from '../_components/ToolCard'
import { ToolCardHeader } from '../_components/ToolCard/Header'
import {
  ToolCardContentWrapper,
  ToolCardOutput,
  ToolCardPendingState,
} from '../_components/ToolCard/Content'

const isExpectedOutput = (toolResponse: ToolResultContent | undefined) => {
  // Returns false if the tool response does not contain the expected output
  if (!toolResponse) return false
  if (toolResponse.isError) return false

  if (typeof toolResponse.result !== 'object' || toolResponse.result === null) {
    return false
  }

  if (!('content' in toolResponse.result)) return false
  const { content } = toolResponse.result
  if (typeof content !== 'string') return false

  return true
}

function WebExtractOutput({
  toolResponse,
  simulated,
  status,
}: {
  toolResponse: ToolResultContent | undefined
  simulated?: boolean
  status: ToolCallStatus
}) {
  const isExpectedResponse = useMemo(
    () => isExpectedOutput(toolResponse),
    [toolResponse],
  )

  const markdownContent = useMemo(() => {
    if (!isExpectedResponse) return undefined
    return (toolResponse!.result as ExtractToolResult).content
  }, [toolResponse, isExpectedResponse])

  if (!toolResponse) {
    return (
      <ToolCardPendingState status={status} loadingText='Loading page...' />
    )
  }

  if (!isExpectedResponse) {
    return (
      <ToolCardOutput
        toolResponse={toolResponse}
        simulated={simulated}
        status={status}
      />
    )
  }

  return (
    <ToolCardContentWrapper>
      {markdownContent ? (
        <Markdown size='sm' color='foregroundMuted'>
          {markdownContent}
        </Markdown>
      ) : (
        <Text.H5 color='foregroundMuted'>No content</Text.H5>
      )}
    </ToolCardContentWrapper>
  )
}

export function WebExtractLatitudeToolCard({
  toolRequest,
  toolResponse,
  status,
  messageIndex,
  contentBlockIndex,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolResultContent | undefined
  status: ToolCallStatus
  messageIndex?: number
  contentBlockIndex?: number
}) {
  const [isOpen, setIsOpen] = useState(false)
  const args = toolRequest.args as ExtractToolArgs

  return (
    <ToolCardWrapper
      messageIndex={messageIndex}
      contentBlockIndex={contentBlockIndex}
    >
      <ToolCardHeader
        icon={<ToolCardIcon status={status} name='globe' />}
        label={<ToolCardText color='foregroundMuted'>{args.url}</ToolCardText>}
        status={status}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        simulated={toolRequest._sourceData?.simulated}
      />
      {isOpen && (
        <WebExtractOutput
          toolResponse={toolResponse}
          simulated={toolRequest._sourceData?.simulated}
          status={status}
        />
      )}
    </ToolCardWrapper>
  )
}
