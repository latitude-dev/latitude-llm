import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { DocumentVersion } from '../../../../schema/models/types/DocumentVersion'
import { PromisedResult } from '../../../../lib/Transaction'
import { ToolManifestDict } from '@latitude-data/constants'
import { LatitudeError } from '@latitude-data/constants/errors'
import { lookupClientTools } from './clientTools'
import { Result } from '../../../../lib/Result'
import { lookupLatitudeTools } from './latitudeTools'
import { lookupAgentsAsTools } from './agentsAsTools'
import { lookupIntegrationTools } from './integrationTools'
import { Workspace } from '../../../../schema/models/types/Workspace'
import { lookupProviderTools } from './providerTools'

export async function lookupTools({
  config,
  documentUuid,
  documents,
  workspace,
}: {
  config: Pick<LatitudePromptConfig, 'tools' | 'agents'>
  documentUuid: string
  documents: DocumentVersion[]
  workspace: Workspace
}): PromisedResult<ToolManifestDict, LatitudeError> {
  const clientToolsResult = lookupClientTools({ config })
  if (clientToolsResult.error) return clientToolsResult

  const latitudeToolsResult = lookupLatitudeTools({ config })
  if (latitudeToolsResult.error) return latitudeToolsResult

  const agentsAsToolsResult = await lookupAgentsAsTools({
    config,
    documentUuid,
    documents,
  })
  if (agentsAsToolsResult.error) return agentsAsToolsResult

  const integrationToolsResult = await lookupIntegrationTools({
    config,
    workspace,
  })
  if (integrationToolsResult.error) return integrationToolsResult

  const providerToolsResult = lookupProviderTools({ config })
  if (providerToolsResult.error) return providerToolsResult

  return Result.ok(
    Object.assign(
      clientToolsResult.value,
      latitudeToolsResult.value,
      agentsAsToolsResult.value,
      integrationToolsResult.value,
      providerToolsResult.value,
    ),
  )
}
