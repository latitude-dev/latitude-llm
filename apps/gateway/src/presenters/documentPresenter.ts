import {
  Commit,
  DocumentVersion,
  Providers,
  Workspace,
} from '@latitude-data/core/browser'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { scanDocumentContent } from '@latitude-data/core/services/documents/scan'
import { z } from '@hono/zod-openapi'

export const documentPresenterSchema = z.object({
  uuid: z.string(),
  path: z.string(),
  content: z.string(),
  config: z.object({}).passthrough(),
  provider: z.nativeEnum(Providers).optional(),
})

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

  return {
    uuid: document.documentUuid,
    path: document.path,
    content: document.content,
    config: metadata?.config,
    provider,
  }
}
