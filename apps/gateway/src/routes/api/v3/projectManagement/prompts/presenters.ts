import {
  Commit,
  DocumentVersion,
  PublishedDocument,
  Workspace,
} from '@latitude-data/core/browser'
import { scanDocumentContent } from '@latitude-data/core/services/documents/scan'
import {
  DocumentData,
  DocumentList,
  ParameterType,
  PromptConfig,
  PublishedDocumentData,
} from '@latitude-data/constants'

export function publishedDocumentPresenter(
  publishedDocument?: PublishedDocument,
): PublishedDocumentData | false {
  if (!publishedDocument?.isPublished) return false

  return {
    title: publishedDocument.title ?? undefined,
    description: publishedDocument.description ?? undefined,
    url: `https://app.latitude.so/share/d/${publishedDocument.uuid}`, // TODO: get the actual url domain from vars
    canChat: publishedDocument.canFollowConversation ?? false,
  }
}

export async function documentPresenter({
  workspace,
  commit,
  document,
  publishedDocument,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  publishedDocument?: PublishedDocument
}): Promise<DocumentData> {
  const metadataResult = await scanDocumentContent({
    workspaceId: workspace.id,
    document,
    commit,
  })

  const metadata = metadataResult.ok ? metadataResult.unwrap() : undefined

  let config = {} as PromptConfig
  let parameters: Record<string, { type: ParameterType }> = {}
  if (metadata) {
    config = metadata.config as PromptConfig
    const params = Array.from(metadata.parameters)
    parameters = Object.fromEntries(
      params.map((param) => {
        const paramDefinition = config.parameters?.[param] ?? {
          type: ParameterType.Text,
        }
        return [param, paramDefinition]
      }),
    )
  }

  return {
    uuid: document.documentUuid,
    path: document.path,
    type: document.documentType === 'agent' ? 'agent' : 'prompt',
    config,
    parameters,
    content: document.content,
    published: publishedDocumentPresenter(publishedDocument),
  }
}

export function documentListPresenter({
  documents,
  publishedDocuments,
}: {
  documents: DocumentVersion[]
  publishedDocuments: PublishedDocument[]
}): DocumentList {
  return documents.map((document) => {
    const publishedDocument = publishedDocuments.find(
      (pd) => pd.documentUuid === document.documentUuid,
    )
    return {
      uuid: document.documentUuid,
      path: document.path,
      type: document.documentType === 'agent' ? 'agent' : 'prompt',
      published: publishedDocumentPresenter(publishedDocument),
      content: document.content,
    }
  })
}
