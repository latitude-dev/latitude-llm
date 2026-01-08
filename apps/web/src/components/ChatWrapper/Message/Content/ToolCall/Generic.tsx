import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import { ToolCard, ToolCardIcon, ToolCardText } from './_components/ToolCard'

export function GenericToolCard({
  toolRequest,
  toolResponse,
  status,
  messageIndex,
  contentBlockIndex,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: 'pending' | 'success' | 'error'
  messageIndex?: number
  contentBlockIndex?: number
}) {
  return (
    <ToolCard
      toolRequest={toolRequest}
      toolResponse={toolResponse}
      headerIcon={<ToolCardIcon status={status} name='wrench' />}
      headerLabel={<ToolCardText>{toolRequest.toolName}</ToolCardText>}
      messageIndex={messageIndex}
      contentBlockIndex={contentBlockIndex}
    />
  )
}
