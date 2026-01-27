import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
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
  messageIndex,
  contentBlockIndex,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: ToolCallStatus
  sourceData: ToolSourceData<ToolSource.Latitude>
  debugMode?: boolean
  messageIndex?: number
  contentBlockIndex?: number
}) {
  if (debugMode) {
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
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
        status={status}
      />
    )
  }

  if (sourceData.latitudeTool === LatitudeTool.RunCode) {
    return (
      <RunCodeLatitudeToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  }
  if (sourceData.latitudeTool === LatitudeTool.WebSearch) {
    return (
      <WebSearchLatitudeToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  }
  if (sourceData.latitudeTool === LatitudeTool.WebExtract) {
    return (
      <WebExtractLatitudeToolCard
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        status={status}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  }
  if (sourceData.latitudeTool === LatitudeTool.Think) {
    return (
      <ThinkLatitudeToolCard
        toolRequest={toolRequest}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
  }
  if (sourceData.latitudeTool === LatitudeTool.TODO) {
    return (
      <TodoLatitudeToolCard
        toolRequest={toolRequest}
        messageIndex={messageIndex}
        contentBlockIndex={contentBlockIndex}
      />
    )
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
      messageIndex={messageIndex}
      contentBlockIndex={contentBlockIndex}
      status={status}
    />
  )
}
