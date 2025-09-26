import Transaction from '../../lib/Transaction'
import { IntegrationsRepository } from '../../repositories'
import { documentIntegrationReferences } from '../../schema'
import { and, eq } from 'drizzle-orm'
import { getDocumentMetadata } from './scan'
import { DocumentVersion } from '../../browser'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { Result } from '../../lib/Result'

function getToolIds(tools: LatitudePromptConfig['tools']): string[] {
  if (!tools) return []

  if (typeof tools === 'string') {
    return [tools]
  }

  if (Array.isArray(tools)) {
    return tools
      .map((tool) => {
        if (typeof tool === 'string') return [tool]

        return Object.keys(tool)
      })
      .flat()
  }

  return Object.keys(tools)
}

function getIntegrationNames(toolsIds: string[]): string[] {
  return toolsIds
    .map((toolId) => {
      const [integrationName, toolName] = toolId.split('/')
      if (!integrationName?.length) return undefined // Return undefined if name is empty
      if (!toolName?.length) return undefined // Return undefined if there is no '/' (not an integration tool)
      return integrationName
    })
    .filter((name): name is string => name !== undefined) // Remove instances where there is no '/'
    .filter((name, index, array) => array.indexOf(name) === index) // Remove duplicates
}

export async function updateListOfIntegrations(
  {
    workspaceId,
    projectId,
    documentVersion,
  }: {
    workspaceId: number
    projectId: number
    documentVersion: DocumentVersion
  },
  tx: Transaction = new Transaction(),
) {
  const metadata = await getDocumentMetadata({
    document: documentVersion,
    getDocumentByPath: () => undefined,
  })

  const config = metadata.config as LatitudePromptConfig
  const toolsIds = getToolIds(config.tools)
  const integrationNames = getIntegrationNames(toolsIds)

  return tx.call(async (tx) => {
    const integrationsScope = new IntegrationsRepository(workspaceId, tx)
    const integrationsResult = await integrationsScope.findAll()
    const allIntegrations = integrationsResult.unwrap()
    const includedIntegrations = allIntegrations.filter((integration) =>
      integrationNames.includes(integration.name),
    )

    // Delete last integrations
    await tx
      .delete(documentIntegrationReferences)
      .where(
        and(
          eq(
            documentIntegrationReferences.documentUuid,
            documentVersion.documentUuid,
          ),
          eq(documentIntegrationReferences.commitId, documentVersion.commitId),
        ),
      )

    // Add all integration references
    await tx.insert(documentIntegrationReferences).values(
      includedIntegrations.map((integration) => ({
        workspaceId,
        projectId,
        commitId: documentVersion.commitId,
        documentUuid: documentVersion.documentUuid,
        integrationId: integration.id,
      })),
    )

    return Result.ok(includedIntegrations)
  })
}
