import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { and, eq } from 'drizzle-orm'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { findAllIntegrations } from '../../queries/integrations/findAll'
import { documentIntegrationReferences } from '../../schema/models/documentIntegrationReferences'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { getDocumentMetadata } from './scan'

function getToolIds(tools: LatitudePromptConfig['tools']): string[] {
  if (!tools) return []

  if (typeof tools === 'string') {
    return [tools]
  }

  if (Array.isArray(tools)) {
    return tools
      .map((tool) => {
        if (!tool) return []
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
    workspace,
    projectId,
    documentVersion,
  }: {
    workspace: Workspace
    projectId: number
    documentVersion: DocumentVersion
  },
  tx: Transaction = new Transaction(),
) {
  const metadata = await getDocumentMetadata({
    document: documentVersion,
    getDocumentByPath: async () => undefined,
  })

  const config = metadata.config as LatitudePromptConfig
  const toolsIds = getToolIds(config.tools)
  const integrationNames = getIntegrationNames(toolsIds)

  return tx.call(async (tx) => {
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

    const allIntegrations = await findAllIntegrations(
      { workspaceId: workspace.id },
      tx,
    )
    const includedIntegrations = allIntegrations.filter((integration) =>
      integrationNames.includes(integration.name),
    )

    if (includedIntegrations.length) {
      // Add all integration references
      await tx.insert(documentIntegrationReferences).values(
        includedIntegrations.map((integration) => ({
          workspaceId: workspace.id,
          projectId,
          commitId: documentVersion.commitId,
          documentUuid: documentVersion.documentUuid,
          integrationId: integration.id,
        })),
      )
    }

    return Result.ok(includedIntegrations)
  })
}
