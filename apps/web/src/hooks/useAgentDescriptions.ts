import { scan } from 'promptl-ai'
import { DocumentVersion } from '@latitude-data/core/schema/types'
import { resolveRelativePath } from '@latitude-data/constants'
import { useState, useEffect, useMemo } from 'react'

export function useDocumentDescriptions({
  documentVersions,
  selectedDocuments,
  currentDocument,
}: {
  documentVersions?: DocumentVersion[]
  selectedDocuments: string[]
  currentDocument?: DocumentVersion
}) {
  const [documentDescriptions, setDocumentDescriptions] = useState<
    Record<string, string>
  >({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!documentVersions) return
    if (!currentDocument) return
    if (!selectedDocuments || selectedDocuments.length === 0) return

    const fetchDescriptions = async () => {
      setIsLoading(true)
      const descriptions: Record<string, string> = {}

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
              descriptions[fullPath] = metadata.config.description
            }
          } catch (error) {
            // Ignore errors in metadata parsing
            console.error('Error parsing metadata for', fullPath, error)
          }
        }
      }
      setIsLoading(false)
      setDocumentDescriptions(descriptions)
    }

    fetchDescriptions()
  }, [documentVersions, selectedDocuments, currentDocument])

  return useMemo(
    () => ({ documentDescriptions, isLoading }),
    [documentDescriptions, isLoading],
  )
}
