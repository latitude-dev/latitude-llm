import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import {
  ToolSource,
  ToolSourceData,
} from '@latitude-data/constants/toolSources'
import { ToolCard, ToolCardIcon, ToolCardText } from './_components/ToolCard'
import { LatitudeTool } from '@latitude-data/constants'
import { WebSearchLatitudeToolCard } from './LatitudeTools/Search'
import { WebExtractLatitudeToolCard } from './LatitudeTools/Extract'
import { ThinkLatitudeToolCard } from './LatitudeTools/Think'
import { TodoLatitudeToolCard } from './LatitudeTools/Todo'
import { RunCodeLatitudeToolCard } from './LatitudeTools/Code'
import { ICON_BY_LATITUDE_TOOL } from '$/lib/toolIcons'

export function LatitudeToolCard({
  toolRequest,
  toolResponse,
  status,
  sourceData,
  debugMode,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: 'pending' | 'success' | 'error'
  sourceData: ToolSourceData<ToolSource.Latitude>
  debugMode?: boolean
}) {
  if (debugMode) {
    // No custom UI
    return (
      <ToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        headerIcon={
          <ToolCardIcon
            status={status}
            name={ICON_BY_LATITUDE_TOOL[sourceData.latitudeTool]}
          />
        }
        headerLabel={<ToolCardText>{toolRequest.toolName}</ToolCardText>}
      />
    )
  }

  if (sourceData.latitudeTool === LatitudeTool.RunCode) {
    return (
      <RunCodeLatitudeToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
      />
    )
  }
  if (sourceData.latitudeTool === LatitudeTool.WebSearch) {
    return (
      <WebSearchLatitudeToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
      />
    )
  }
  if (sourceData.latitudeTool === LatitudeTool.WebExtract) {
    return (
      <WebExtractLatitudeToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
      />
    )
  }
  if (sourceData.latitudeTool === LatitudeTool.Think) {
    return <ThinkLatitudeToolCard toolRequest={toolRequest} />
  }
  if (sourceData.latitudeTool === LatitudeTool.TODO) {
    return <TodoLatitudeToolCard toolRequest={toolRequest} />
  }

  return (
    <ToolCard
      toolRequest={toolRequest}
      toolResponse={toolResponse}
      headerIcon={
        <ToolCardIcon
          status={status}
          name={ICON_BY_LATITUDE_TOOL[sourceData.latitudeTool]}
        />
      }
      headerLabel={<ToolCardText>{toolRequest.toolName}</ToolCardText>}
    />
  )
}
