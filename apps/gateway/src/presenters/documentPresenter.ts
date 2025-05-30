import {
  Commit,
  DocumentVersion,
  Providers,
  Workspace,
} from '@latitude-data/core/browser'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { scanDocumentContent } from '@latitude-data/core/services/documents/scan'
import { z } from '@hono/zod-openapi'
import { ConversationMetadata as CompilerConversationMetadata } from '@latitude-data/compiler'
import { ConversationMetadata as PromptlConversationMetadata } from 'promptl-ai'
import { ParameterType } from '@latitude-data/constants'

type ConversationMetadata =
  | CompilerConversationMetadata
  | PromptlConversationMetadata
export const documentPresenterSchema = z.object({
  uuid: z.string(),
  path: z.string(),
  content: z.string(),
  config: z.object({}).passthrough(),
  parameters: z.record(z.object({ type: z.nativeEnum(ParameterType) })),
  provider: z.nativeEnum(Providers).optional(),
})
type Parameters = z.infer<typeof documentPresenterSchema>['parameters']

export function documentPresenterWithProviderAndMetadata({
  document,
  metadata,
  provider,
}: {
  document: DocumentVersion
  metadata: ConversationMetadata | undefined
  provider: Providers | undefined
}) {
  const configParams = (metadata?.config['parameters'] ?? {}) as Parameters
  const rawParams = metadata?.parameters
    ? Array.from(metadata.parameters.values())
    : []
  const parameters =
    rawParams.length > 0
      ? rawParams.reduce(
          (acc, rawParam) => {
            if (acc[rawParam]) return acc
            acc[rawParam] = { type: ParameterType.Text }

            return acc
          },
          { ...configParams },
        )
      : configParams

  return {
    uuid: document.documentUuid,
    path: document.path,
    content: document.content,
    config: metadata?.config,
    parameters,
    provider,
  }
}

export async function documentPresenter({
  document,
  commit,
  workspace,
}: {
  document: DocumentVersion
  commit: Commit
  workspace: Workspace
}) {
  const metadataResult = await scanDocumentContent({
    workspaceId: workspace.id,
    document,
    commit,
  })

  const metadata = metadataResult.ok ? metadataResult.unwrap() : undefined

  let provider: Providers | undefined = undefined
  if (metadata) {
    const providerName = metadata.config.provider as string

    if (providerName) {
      const providersScope = new ProviderApiKeysRepository(workspace.id)
      const providerResult = await providersScope.findByName(providerName)
      if (providerResult.ok) {
        provider = providerResult.unwrap().provider
      }
    }

    document.resolvedContent = metadata.resolvedPrompt
  }

  return documentPresenterWithProviderAndMetadata({
    document,
    metadata,
    provider,
  })
}
