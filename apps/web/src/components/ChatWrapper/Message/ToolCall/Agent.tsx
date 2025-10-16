import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import {
  ToolSource,
  ToolSourceData,
} from '@latitude-data/constants/toolSources'
import { ToolCard, ToolCardIcon, ToolCardText } from './_components/ToolCard'

export function AgentToolCard({
  toolRequest,
  toolResponse,
  status,
  sourceData,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: 'pending' | 'success' | 'error'
  sourceData: ToolSourceData<ToolSource.Agent>
}) {
  return (
    <ToolCard
      toolRequest={toolRequest}
      toolResponse={toolResponse}
      headerIcon={<ToolCardIcon status={status} name='bot' />}
      headerLabel={<ToolCardText>{sourceData.agentPath}</ToolCardText>}
    />
  )
}
