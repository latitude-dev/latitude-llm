import { LogSources, Message } from '@latitude-data/constants'
import { LegacyVercelSDKVersion4Usage as LanguageModelUsage } from '@latitude-data/constants/ai'
import { CostBreakdown } from '@latitude-data/constants/costs'
import { SimulationSettings } from '@latitude-data/constants/simulation'
import { LanguageModelUsage as LanguageModelUsageType } from '../../../../constants'
import { OkType } from '../../../../lib/Result'
import { DeploymentTest } from '../../../../schema/models/types/DeploymentTest'
import { runDocumentAtCommit } from '../../../../services/commits/runDocumentAtCommit'

export type RunMetrics = {
  runUsage: LanguageModelUsage
  runCost: CostBreakdown
  duration: number
}

export type { LanguageModelUsageType }

/**
 * Input data for the background run job
 */
export type BackgroundRunJobData = {
  workspaceId: number
  projectId: number
  commitUuid: string
  experimentId?: number
  datasetRowId?: number
  documentUuid: string
  runUuid: string
  parameters?: Record<string, unknown>
  customIdentifier?: string
  tools?: string[]
  mcpHeaders?: Record<string, Record<string, string>>
  userMessage?: string
  messages?: Message[]
  source?: LogSources
  simulationSettings?: SimulationSettings
  activeDeploymentTest?: DeploymentTest
}

/**
 * Result returned by the background run job
 */
export type BackgroundRunJobResult = {
  lastResponse: Awaited<OkType<typeof runDocumentAtCommit>['lastResponse']>
  toolCalls: Awaited<OkType<typeof runDocumentAtCommit>['toolCalls']>
}

/**
 * Common run identifiers used across helper functions
 */
export type RunIdentifiers = {
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  runUuid: string
}
