import { LogSources } from '@latitude-data/constants'
import { SimulationSettings } from '@latitude-data/constants/simulation'
import { OkType } from '../../../../lib/Result'
import { runDocumentAtCommit } from '../../../../services/commits/runDocumentAtCommit'
import { DeploymentTest } from '../../../../schema/models/types/DeploymentTest'

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
