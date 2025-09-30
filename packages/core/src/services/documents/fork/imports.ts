import {
  DocumentTriggerType,
  resolveRelativePath,
} from '@latitude-data/constants'
import {
  Commit,
  DocumentVersion,
  IntegrationDto,
  Workspace,
} from '../../../browser'
import { Result } from '../../../lib/Result'
import {
  DocumentTriggersRepository,
  DocumentVersionsRepository,
  IntegrationsRepository,
} from '../../../repositories'
import { getDocumentMetadata } from '../scan'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { ImportProps } from './types'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import {
  getIntegrationNamesFromTools,
  getIntegrationToolsFromConfig,
} from './helpers'
import { IntegrationTriggerConfiguration } from '@latitude-data/constants/documentTriggers'

async function findImportsRecursive(
  document: DocumentVersion,
  data: {
    originalDocument: DocumentVersion
    documents: DocumentVersion[]
    integrations: IntegrationDto[]
  },
  acc: {
    agents: Set<DocumentVersion>
    snippets: Set<DocumentVersion>
    integrations: Set<IntegrationDto>
  },
  asSnippet: boolean = false,
) {
  const getDocumentByPath = (path: string) =>
    data.documents.find((doc) => doc.path === path)
  const absolutePath = (path: string) =>
    resolveRelativePath(path, data.originalDocument.path)

  const metadata = await getDocumentMetadata({ document, getDocumentByPath })
  const config = metadata.config as LatitudePromptConfig

  const snippetsPaths = Array.from(metadata.includedPromptPaths)
  const agentsPaths = Array.from(config.agents ?? []).map(absolutePath)
  const snippets = snippetsPaths
    .map(getDocumentByPath)
    .filter((snippet) => snippet !== undefined)
  const agents = agentsPaths
    .map(getDocumentByPath)
    .filter((agent) => agent !== undefined)

  if (!asSnippet) {
    // Find integrations
    const toolIds = getIntegrationToolsFromConfig(config)
    const integrationNames = getIntegrationNamesFromTools(toolIds)
    const integrations = data.integrations.filter((integration) =>
      integrationNames.includes(integration.name),
    )
    integrations.forEach((integration) => acc.integrations.add(integration))

    // Compute imports from agents
    for (const agent of agents) {
      if (agent.path === data.originalDocument.path) continue
      if (acc.agents.has(agent)) continue

      if (acc.snippets.has(agent)) {
        acc.snippets.delete(agent) // If a document is included both as an agent and a snippet, we just treat it as an agent
      }
      acc.agents.add(agent)
      await findImportsRecursive(agent, data, acc, asSnippet)
    }
  }

  // Compute imports from snippets
  for (const snippet of snippets) {
    if (snippet.path === data.originalDocument.path) continue
    if (acc.snippets.has(snippet)) continue
    if (acc.agents.has(snippet)) continue
    acc.snippets.add(snippet)
    await findImportsRecursive(snippet, data, acc, true)
  }
}

export async function getImports(
  {
    workspace,
    commit,
    document,
  }: {
    workspace: Workspace
    commit: Commit
    document: DocumentVersion
  },
  transaction = new Transaction(),
): PromisedResult<ImportProps> {
  return transaction.call(async (tx) => {
    const documentsRepo = new DocumentVersionsRepository(workspace.id, tx)
    const allDocumentsResult = await documentsRepo.getDocumentsAtCommit(commit)
    if (allDocumentsResult.error) {
      return Result.error(allDocumentsResult.error)
    }
    const allDocuments = allDocumentsResult.unwrap()

    const integrationsRepo = new IntegrationsRepository(workspace.id, tx)
    const allIntegrationsResult = await integrationsRepo.findAll()
    if (allIntegrationsResult.error) {
      return Result.error(allIntegrationsResult.error)
    }
    const allIntegrations = allIntegrationsResult.unwrap()

    const agents = new Set<DocumentVersion>()
    const snippets = new Set<DocumentVersion>()
    const integrations = new Set<IntegrationDto>()

    await findImportsRecursive(
      document,
      {
        originalDocument: document,
        documents: allDocuments,
        integrations: allIntegrations,
      },
      {
        agents,
        snippets,
        integrations,
      },
    )

    const triggersRepo = new DocumentTriggersRepository(workspace.id, tx)
    const triggersResult = await triggersRepo.getTriggersInDocument({
      documentUuid: document.documentUuid,
      commit,
    })
    if (triggersResult.error) {
      return Result.error(triggersResult.error)
    }
    const triggers = triggersResult.unwrap()

    triggers.forEach((trigger) => {
      if (trigger.triggerType !== DocumentTriggerType.Integration) return
      const triggerConfiguration =
        trigger.configuration as IntegrationTriggerConfiguration

      const integration = allIntegrations.find(
        (integration) => integration.id === triggerConfiguration.integrationId,
      )
      if (!integration) return
      integrations.add(integration)
    })

    return Result.ok({
      document,
      agents: Array.from(agents),
      snippets: Array.from(snippets),
      integrations: Array.from(integrations),
      triggers,
    })
  })
}
