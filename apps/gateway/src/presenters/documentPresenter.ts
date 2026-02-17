import { z } from '@hono/zod-openapi'
import { ParameterType } from '@latitude-data/constants'
import { findProviderApiKeyByName } from '@latitude-data/core/queries/providerApiKeys/findByName'
import { scanDocumentContent } from '@latitude-data/core/services/documents/scan'
import { ConversationMetadata } from 'promptl-ai'
import { Providers } from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

export const documentPresenterSchema = z.object({
  versionUuid: z.string(),
  uuid: z.string(),
  path: z.string(),
  content: z.string(),
  contentHash: z.string().optional(),
  config: z.record(z.string(), z.any()).openapi({
    type: 'object',
    additionalProperties: true,
    description: 'Document configuration as key-value pairs',
  }),
  parameters: z
    .record(
      z.string(),
      z.object({ type: z.enum(ParameterType) }).openapi({
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['text', 'image', 'file'] },
        },
      }),
    )
    .openapi({
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['text', 'image', 'file'] },
        },
      },
      description: 'Document parameters with their types',
    }),
  provider: z
    .enum(Providers)
    .optional()
    .openapi({
      type: 'string',
      enum: [
        'openai',
        'anthropic',
        'groq',
        'mistral',
        'azure',
        'google',
        'google_vertex',
        'anthropic_vertex',
        'custom',
        'xai',
        'amazon_bedrock',
        'deepseek',
        'perplexity',
      ],
      description: 'The provider used for this document',
    }),
})
type Parameters = z.infer<typeof documentPresenterSchema>['parameters']

export function documentPresenterWithProviderAndMetadata({
  document,
  metadata,
  provider,
  commit,
}: {
  document: DocumentVersion
  metadata: ConversationMetadata | undefined
  provider: Providers | undefined
  commit: Commit
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
    versionUuid: commit.uuid,
    uuid: document.documentUuid,
    path: document.path,
    content: document.content,
    contentHash: document.contentHash ?? undefined,
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
    document,
    commit,
  })

  const metadata = metadataResult.ok ? metadataResult.unwrap() : undefined

  let provider: Providers | undefined = undefined
  if (metadata) {
    const providerName = metadata.config.provider as string

    if (providerName) {
      try {
        const providerKey = await findProviderApiKeyByName({
          workspaceId: workspace.id,
          name: providerName,
        })
        provider = providerKey.provider
      } catch {
        provider = undefined
      }
    }

    document.resolvedContent = metadata.resolvedPrompt
  }

  return documentPresenterWithProviderAndMetadata({
    document,
    metadata,
    provider,
    commit,
  })
}
