import { Providers, VercelProviderTool } from '@latitude-data/constants'
import {
  ToolSource,
  ToolSourceData,
} from '@latitude-data/constants/toolSources'
import { Tool } from 'ai'

type ResolvedTool<T extends ToolSource = ToolSource> = {
  definition: Tool
  sourceData: ToolSourceData<T>
}

export type ResolvedProviderTool = {
  definition: VercelProviderTool
  sourceData: {
    source: ToolSource.ProviderTool
    provider: Providers
  }
}

export type ResolvedTools<T extends ToolSource = ToolSource> = Record<
  string,
  T extends ToolSource.ProviderTool ? ResolvedProviderTool : ResolvedTool<T>
>
