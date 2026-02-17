import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { type Project } from '../../../schema/models/types/Project'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { type Commit } from '../../../schema/models/types/Commit'
import { type User } from '../../../schema/models/types/User'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { Providers } from '@latitude-data/constants'
import { findFirstModelForProvider } from '../../ai/providers/models'
import { Result } from '../../../lib/Result'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { findAllProviderApiKeys } from '../../../queries/providerApiKeys/findAll'
import { createNewDocument } from '../create'
import { getDocumentMetadata } from '../scan'
import { ImportProps, IntegrationMapping } from './types'
import { omit } from 'lodash-es'
import { findDefaultProvider } from '../../providerApiKeys/findDefaultProvider'
import { env } from '@latitude-data/env'
import {
  getCustomToolsFromConfig,
  getIntegrationToolsFromConfig,
} from './helpers'

function getBestMatchingProvider({
  originProviders,
  targetProviders,
  defaultProvider,
  provider,
  model,
}: {
  originProviders: ProviderApiKey[]
  targetProviders: ProviderApiKey[]
  defaultProvider: ProviderApiKey | undefined
  provider: string
  model: string
}): { provider: string; model: string } {
  const originalProvider = originProviders.find((p) => p.name === provider)

  const defaultProviderName =
    defaultProvider?.name ?? env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME
  const defaultModel =
    findFirstModelForProvider({
      provider: defaultProvider,
      defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
    }) ?? 'gpt-4o-mini'

  if (!originalProvider) {
    return {
      provider: defaultProviderName,
      model: defaultModel,
    }
  }

  const targetProvider = targetProviders.find(
    (p) =>
      p.provider === originalProvider.provider &&
      p.provider !== Providers.Custom,
  )
  if (!targetProvider) {
    return {
      provider: defaultProviderName,
      model: defaultModel,
    }
  }

  return {
    provider: targetProvider.name,
    model,
  }
}

function getNewToolList({
  config,
  integrationMapping,
}: {
  config: LatitudePromptConfig
  integrationMapping: IntegrationMapping
}) {
  const integrationToolIds = getIntegrationToolsFromConfig(config)
  const customTools = getCustomToolsFromConfig(config)

  const allTools = [
    // Integration tools
    ...integrationToolIds.map((toolId) => {
      const [integrationName, toolName] = toolId.split('/')
      const newIntegration = integrationMapping.name[integrationName]

      if (!newIntegration) return toolId // Return original as fallback
      return `${newIntegration.name}/${toolName}`
    }),

    // Custom tools
    ...Object.entries(customTools).map(([name, tool]) => ({
      [name]: tool,
    })),
  ]

  return allTools
}

async function cloneSingleDocument({
  workspace,
  commit,
  document,
  user,

  originProviders,
  targetProviders,
  defaultProvider,
  integrationMapping,
  withoutConfig,
}: {
  workspace: Workspace
  project: Project
  commit: Commit
  document: DocumentVersion
  user: User
  originProviders: ProviderApiKey[]
  targetProviders: ProviderApiKey[]
  defaultProvider: ProviderApiKey | undefined
  integrationMapping: IntegrationMapping
  withoutConfig: boolean
}): PromisedResult<DocumentVersion> {
  const metadata = await getDocumentMetadata({
    document,
    getDocumentByPath: async () => undefined,
  })

  const { setConfig } = metadata
  const config = metadata.config as LatitudePromptConfig

  if (withoutConfig) {
    const content = setConfig({})

    return createNewDocument({
      workspace,
      user,
      commit,
      path: document.path,
      content,
    })
  }

  const { provider, model } = getBestMatchingProvider({
    originProviders,
    targetProviders,
    defaultProvider,
    provider: config.provider,
    model: config.model,
  })

  const tools = getNewToolList({
    config,
    integrationMapping,
  })

  const content = setConfig({
    provider,
    model,
    ...omit(config, 'provider', 'model', 'tools'),

    ...(tools.length ? { tools } : {}),
  })

  return createNewDocument({
    workspace,
    user,
    commit,
    path: document.path,
    content,
  })
}

export async function cloneDocuments(
  {
    originWorkspace,
    targetWorkspace,
    targetProject,
    targetCommit,
    targetUser,
    imports,
    integrationMapping,
  }: {
    originWorkspace: Workspace
    targetWorkspace: Workspace
    targetProject: Project
    targetCommit: Commit
    targetUser: User
    imports: ImportProps
    integrationMapping: IntegrationMapping
  },
  transaction = new Transaction(),
): PromisedResult<DocumentVersion[]> {
  return transaction.call(async (tx) => {
    const originProviders = await findAllProviderApiKeys(
      { workspaceId: originWorkspace.id },
      tx,
    )

    const targetProviders = await findAllProviderApiKeys(
      { workspaceId: targetWorkspace.id },
      tx,
    )

    const defaultProviderResult = await findDefaultProvider(targetWorkspace, tx)
    if (!Result.isOk(defaultProviderResult)) return defaultProviderResult
    const defaultProvider = defaultProviderResult.unwrap()

    const cloneDocument = (
      document: DocumentVersion,
      withoutConfig: boolean = false,
    ) =>
      cloneSingleDocument({
        workspace: targetWorkspace,
        project: targetProject,
        commit: targetCommit,
        document,
        user: targetUser,
        originProviders,
        targetProviders,
        defaultProvider,
        integrationMapping,
        withoutConfig,
      })

    const clonedDocuments: DocumentVersion[] = []

    const clonedDocumentResult = await cloneDocument(imports.document)
    if (clonedDocumentResult.error) return clonedDocumentResult
    const clonedDocument = clonedDocumentResult.unwrap()
    clonedDocuments.push(clonedDocument)

    for (const agent of imports.agents) {
      const clonedAgentResult = await cloneDocument(agent)
      if (clonedAgentResult.error) return clonedAgentResult
      const clonedAgent = clonedAgentResult.unwrap()
      clonedDocuments.push(clonedAgent)
    }

    for (const snippet of imports.snippets) {
      const clonedSnippetResult = await cloneDocument(snippet, true)
      if (clonedSnippetResult.error) return clonedSnippetResult
      const clonedSnippet = clonedSnippetResult.unwrap()
      clonedDocuments.push(clonedSnippet)
    }

    return Result.ok(clonedDocuments)
  })
}
