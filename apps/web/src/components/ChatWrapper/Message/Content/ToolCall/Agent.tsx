import {
  ToolRequestContent,
  ToolResultContent,
} from '@latitude-data/constants/messages'
import {
  ToolSource,
  ToolSourceData,
} from '@latitude-data/constants/toolSources'
import {
  ToolCard,
  ToolCardIcon,
  ToolCardText,
  ToolCallStatus,
} from './_components/ToolCard'

export function AgentToolCard({
  toolRequest,
  toolResponse,
  status,
  sourceData,
  messageIndex,
  contentBlockIndex,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolResultContent | undefined
  status: ToolCallStatus
  sourceData: ToolSourceData<ToolSource.Agent>
  messageIndex?: number
  contentBlockIndex?: number
}) {
  return (
    <ToolCard
      toolRequest={toolRequest}
      toolResponse={toolResponse}
      headerIcon={<ToolCardIcon status={status} name='bot' />}
      headerLabel={<ToolCardText>{sourceData.agentPath}</ToolCardText>}
      messageIndex={messageIndex}
      contentBlockIndex={contentBlockIndex}
      status={status}
    />
  )
}
