import { useEffect } from 'react'
import { useOpenPaths } from './useOpenPaths'
import { SidebarDocument } from './useTree'

/**
 * Ensures the selected document path is expanded in the sidebar tree.
 */
export function useOpenCurrentDocumentPath({
  currentUuid,
  documents,
}: {
  currentUuid: string | undefined
  documents: SidebarDocument[]
}) {
  const togglePath = useOpenPaths((state) => state.togglePath)

  useEffect(() => {
    if (!currentUuid) return
    const currentDocument = documents.find(
      (d) => d.documentUuid === currentUuid,
    )
    if (!currentDocument?.path) return
    togglePath(currentDocument.path)
  }, [currentUuid, documents, togglePath])
}
