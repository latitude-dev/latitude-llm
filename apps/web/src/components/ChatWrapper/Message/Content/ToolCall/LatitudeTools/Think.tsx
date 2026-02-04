import type { ThinkToolArgs } from '@latitude-data/core/services/latitudeTools/think/types'
import { ToolRequestContent } from '@latitude-data/constants/messages'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useState } from 'react'
import {
  ToolCardIcon,
  ToolCardText,
  ToolCardWrapper,
} from '../_components/ToolCard'
import { ToolCardHeader } from '../_components/ToolCard/Header'
import { ToolCardContentWrapper } from '../_components/ToolCard/Content'

function uppercaseFirst(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function ThinkLatitudeToolCard({
  toolRequest,
  messageIndex,
  contentBlockIndex,
}: {
  toolRequest: ToolRequestContent
  messageIndex?: number
  contentBlockIndex?: number
}) {
  const [isOpen, setIsOpen] = useState(false)
  const args = toolRequest.args as ThinkToolArgs

  return (
    <ToolCardWrapper
      messageIndex={messageIndex}
      contentBlockIndex={contentBlockIndex}
    >
      <ToolCardHeader
        icon={<ToolCardIcon name='brain' />}
        label={
          <ToolCardText color='foregroundMuted'>
            {uppercaseFirst(args.action)}
          </ToolCardText>
        }
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        simulated={toolRequest._sourceData?.simulated}
      />
      {isOpen && (
        <ToolCardContentWrapper>
          <Text.H5 color='foregroundMuted'>{args.thought}</Text.H5>
        </ToolCardContentWrapper>
      )}
    </ToolCardWrapper>
  )
}
