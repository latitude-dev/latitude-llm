import {
  LatitudeTool,
  Providers,
  ToolDefinition,
  VercelProviderTool,
} from '@latitude-data/constants'

export enum ToolSource {
  Client = 'client',
  Latitude = 'latitude',
  AgentReturn = 'agentReturn',
  AgentAsTool = 'agentAsTool',
  Integration = 'integration',
  ProviderTool = 'providerTool',
}

interface BaseToolSourceData {
  source: ToolSource
}

interface ClientToolSourceData extends BaseToolSourceData {
  source: ToolSource.Client
}

interface LatitudeToolSourceData extends BaseToolSourceData {
  source: ToolSource.Latitude
  latitudeTool: LatitudeTool
}

interface AgentReturnToolSourceData extends BaseToolSourceData {
  source: ToolSource.AgentReturn
}

interface AgentAsToolSourceData extends BaseToolSourceData {
  source: ToolSource.AgentAsTool
  agentPath: string
}

interface IntegrationToolSourceData extends BaseToolSourceData {
  source: ToolSource.Integration
  integrationName: string
  toolName: string
}

export type ToolSourceData =
  | ClientToolSourceData
  | LatitudeToolSourceData
  | AgentReturnToolSourceData
  | AgentAsToolSourceData
  | IntegrationToolSourceData

type ResolvedTool = {
  definition: ToolDefinition
  sourceData: ToolSourceData
}

export type ResolvedProviderTool = {
  definition: VercelProviderTool
  sourceData: {
    source: ToolSource.ProviderTool
    provider: Providers
  }
}

export type ResolvedTools = Record<string, ResolvedTool | ResolvedProviderTool>
