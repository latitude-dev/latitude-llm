import { scan } from 'promptl-ai'
import { DocumentVersion } from '@latitude-data/core/schema/types'
import { resolveRelativePath } from '@latitude-data/constants'
import { useState, useEffect } from 'react'

export function useAgentDescriptions({
  documentVersions,
  selectedAgents,
  currentDocument,
}: {
  documentVersions?: DocumentVersion[]
  selectedAgents: string[]
  currentDocument?: DocumentVersion
}) {
  const [agentDescriptions, setAgentDescriptions] = useState<
    Record<string, string>
  >({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!documentVersions) return
    if (!currentDocument) return
    if (!selectedAgents || selectedAgents.length === 0) return

    const fetchDescriptions = async () => {
      setIsLoading(true)
      const descriptions: Record<string, string> = {}

      for (const relativePath of selectedAgents) {
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
      setAgentDescriptions(descriptions)
    }

    fetchDescriptions()
  }, [documentVersions, selectedAgents, currentDocument])

  return { agentDescriptions, setAgentDescriptions, isLoading }
}
