'use client'
import type {
  ExtractToolArgs,
  ExtractToolResult,
} from '@latitude-data/core/services/latitudeTools/webExtract/types'
import { useMemo, useState } from 'react'
import {
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import { Markdown } from '@latitude-data/web-ui/atoms/Markdown'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  ToolCardIcon,
  ToolCardText,
  ToolCardWrapper,
} from '../_components/ToolCard'
import { ToolCardHeader } from '../_components/ToolCard/Header'
import {
  ToolCardContentWrapper,
  ToolCardOutput,
} from '../_components/ToolCard/Content'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

const isExpectedOutput = (toolResponse: ToolContent | undefined) => {
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
}: {
  toolResponse: ToolContent | undefined
  simulated?: boolean
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
      <ToolCardContentWrapper>
        <div className='flex flex-row gap-2 items-center justify-center pb-3'>
          <Icon name='loader' color='foregroundMuted' spin />
          <Text.H5 color='foregroundMuted'>Loading page...</Text.H5>
        </div>
      </ToolCardContentWrapper>
    )
  }

  if (!isExpectedResponse) {
    return <ToolCardOutput toolResponse={toolResponse} simulated={simulated} />
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
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: 'pending' | 'success' | 'error'
}) {
  const [isOpen, setIsOpen] = useState(false)
  const args = toolRequest.args as ExtractToolArgs

  return (
    <ToolCardWrapper>
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
        />
      )}
    </ToolCardWrapper>
  )
}
