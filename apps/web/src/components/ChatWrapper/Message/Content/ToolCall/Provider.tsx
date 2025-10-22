import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import {
  ToolSource,
  ToolSourceData,
} from '@latitude-data/constants/toolSources'
import { ToolCard, ToolCardIcon, ToolCardText } from './_components/ToolCard'
import { ICON_BY_LLM_PROVIDER } from '$/lib/providerIcons'

export function ProviderToolCard({
  toolRequest,
  toolResponse,
  status,
  sourceData,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: 'pending' | 'success' | 'error'
  sourceData: ToolSourceData<ToolSource.ProviderTool>
}) {
  return (
    <ToolCard
      toolRequest={toolRequest}
      toolResponse={toolResponse}
      headerIcon={
        <ToolCardIcon
          status={status}
          name={ICON_BY_LLM_PROVIDER[sourceData.provider]}
        />
      }
      headerLabel={<ToolCardText>{toolRequest.toolName}</ToolCardText>}
    />
  )
}
