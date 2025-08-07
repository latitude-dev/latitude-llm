import type { Commit, DocumentVersion } from '../../../browser'
import { getDocumentMetadata } from '../scan'

export async function buildDocuments({
  destination,
  origin,
}: {
  destination: {
    commit: Commit
    providerData: {
      providerName: string | undefined
      modelName: string | undefined
    }
  }
  origin: { documents: DocumentVersion[] }
}) {
  return Promise.all(
    origin.documents.map(async (doc) => {
      const { config, setConfig } = await getDocumentMetadata({
        document: doc,
        getDocumentByPath: (path) => origin.documents.find((d) => d.path === path),
      })
      delete config.model
      delete config.provider

      let newConfig = config
      const providerData = destination.providerData

      if (providerData.providerName) {
        newConfig = { ...newConfig, provider: providerData.providerName }
      }

      if (providerData.modelName) {
        newConfig = { ...newConfig, model: providerData.modelName }
      }

      return {
        path: doc.path,
        content: setConfig(newConfig),
        commitId: destination.commit.id,
        promtlVersion: doc.promptlVersion,
      }
    }),
  )
}
