import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import { ToolCard, ToolCardIcon, ToolCardText } from './_components/ToolCard'

export function GenericToolCard({
  toolRequest,
  toolResponse,
  status,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: 'pending' | 'success' | 'error'
}) {
  return (
    <ToolCard
      toolRequest={toolRequest}
      toolResponse={toolResponse}
      headerIcon={<ToolCardIcon status={status} name='wrench' />}
      headerLabel={<ToolCardText>{toolRequest.toolName}</ToolCardText>}
    />
  )
}
