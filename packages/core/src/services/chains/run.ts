import {
  ChainStepResponse,
  LegacyVercelSDKVersion4Usage as LanguageModelUsage,
  MAX_STEPS_CONFIG_NAME,
  StreamType,
} from '@latitude-data/constants'
import type { SimulationSettings } from '@latitude-data/constants/simulation'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { Chain as PromptlChain } from 'promptl-ai'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { LogSources, PromptSource } from '../../constants'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { TypedResult } from '../../lib/Result'
import { ChainStreamManager } from '../../lib/streamManager/chainStreamManager'
import { ToolHandler } from '../documents/tools/clientTools/handlers'
import { TelemetryContext } from '../../telemetry'

export type CachedApiKeys = Map<string, ProviderApiKey>

export const stepLimitExceededErrorMessage = (maxSteps: number) =>
  `Limit of ${maxSteps} steps exceeded. Configure the '${MAX_STEPS_CONFIG_NAME}' setting in your prompt configuration to allow for more steps.`

export type ChainResponse<T extends StreamType> = TypedResult<
  ChainStepResponse<T>,
  ChainError<RunErrorCodes>
>
type CommonArgs<C extends PromptlChain = PromptlChain> = {
  workspace: WorkspaceDto
  providersMap: CachedApiKeys
  source: LogSources
  chain: C
  promptSource: PromptSource

  context: TelemetryContext
  uuid?: string
  messages?: LegacyMessage[]
  pausedTokenUsage?: LanguageModelUsage

  tools?: Record<string, ToolHandler>
  mcpHeaders?: Record<string, Record<string, string>>
  abortSignal?: AbortSignal
  simulationSettings?: SimulationSettings
}

export type RunChainArgs<C extends PromptlChain> = CommonArgs<C>

export function runChain<C extends PromptlChain>({
  context,
  workspace,
  providersMap,
  source,
  chain,
  messages,
  pausedTokenUsage,
  promptSource,
  abortSignal,
  tools = {},
  mcpHeaders,
  uuid = generateUUIDIdentifier(),
  simulationSettings,
}: RunChainArgs<C>) {
  const chainStreamManager = new ChainStreamManager({
    context,
    uuid,
    workspace,
    messages,
    tokenUsage: pausedTokenUsage,
    promptSource,
    providersMap,
    abortSignal,
    source,
    chain,
    tools,
    mcpHeaders,
    simulationSettings,
  })

  const { start, ...rest } = chainStreamManager.prepare()
  start()

  return {
    ...rest,
    uuid: chainStreamManager.uuid,
    resolvedContent: chain.rawText,
    conversation: {
      messages: rest.messages,
    },
  }
}
