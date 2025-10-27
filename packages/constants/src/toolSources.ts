import { Providers } from '.'
import { LatitudeTool } from './config'

export enum ToolSource {
  Client = 'client',
  Latitude = 'latitude',
  Agent = 'agentAsTool',
  Integration = 'integration',
  ProviderTool = 'providerTool',
}

type BaseToolSourceData<T extends ToolSource> = {
  simulated?: boolean
  source: T
}

type ClientToolSourceData = BaseToolSourceData<ToolSource.Client>

type LatitudeToolSourceData = BaseToolSourceData<ToolSource.Latitude> & {
  latitudeTool: LatitudeTool
}

type AgentAsToolSourceData = BaseToolSourceData<ToolSource.Agent> & {
  agentPath: string
  documentUuid: string
  documentLogUuid?: string
}

type IntegrationToolSourceData = BaseToolSourceData<ToolSource.Integration> & {
  integrationId: number
  toolLabel?: string // Human-readable tool label
  imageUrl?: string // For Pipedream integrations
}

type ProviderToolSourceData = BaseToolSourceData<ToolSource.ProviderTool> & {
  provider: Providers
}

// prettier-ignore
export type ToolSourceData<T extends ToolSource = ToolSource> =
  T extends ToolSource.Client ? ClientToolSourceData :
  T extends ToolSource.Latitude ? LatitudeToolSourceData : 
  T extends ToolSource.Agent ? AgentAsToolSourceData :
  T extends ToolSource.Integration ? IntegrationToolSourceData :
  T extends ToolSource.ProviderTool ? ProviderToolSourceData :
  never
