import { scan } from 'promptl-ai'
import { DocumentVersion } from '@latitude-data/core/schema/types'
import { resolveRelativePath } from '@latitude-data/constants'
import { useState, useEffect, useMemo } from 'react'

type DocMeta = {
  description: string
}

export function useDocumentConfiguration({
  documentVersions,
  selectedDocuments,
  currentDocument,
}: {
  documentVersions?: DocumentVersion[]
  selectedDocuments: string[]
  currentDocument?: DocumentVersion
}) {
  const [documentConfigurations, setDocumentConfigurations] = useState<
    Record<string, DocMeta>
  >({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!documentVersions) return
    if (!currentDocument) return
    if (!selectedDocuments || selectedDocuments.length === 0) return

    const fetchDescriptions = async () => {
      setIsLoading(true)
      const configurations: Record<string, DocMeta> = {}

      for (const relativePath of selectedDocuments) {
        const fullPath = resolveRelativePath(relativePath, currentDocument.path)
        const doc = documentVersions.find((d) => d.path === fullPath)

        if (doc?.content) {
          try {
            const metadata = await scan({
              prompt: doc.content,
              fullPath: doc.path,
            })
            if (
              metadata.config?.description &&
              typeof metadata.config.description === 'string'
            ) {
              configurations[fullPath] = {
                description: metadata.config.description,
              }
            }
          } catch (error) {
            // Ignore errors in metadata parsing
            console.error('Error parsing metadata for', fullPath, error)
          }
        }
      }
      setIsLoading(false)
      setDocumentConfigurations(configurations)
    }

    fetchDescriptions()
  }, [documentVersions, selectedDocuments, currentDocument])

  return useMemo(
    () => ({ documentConfigurations, isLoading }),
    [documentConfigurations, isLoading],
  )
}
