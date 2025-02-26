import { LatitudeTool, ToolDefinition } from '@latitude-data/constants'

export enum ToolSource {
  Client = 'client',
  Latitude = 'latitude',
  Agent = 'agent',
  Integration = 'integration',
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

interface AgentAsToolSourceData extends BaseToolSourceData {
  source: ToolSource.Agent
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
  | AgentAsToolSourceData
  | IntegrationToolSourceData

export type ResolvedTools = Record<
  string,
  {
    definition: ToolDefinition
    sourceData: ToolSourceData
  }
>
