import { useMemo } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDocumentVersions from '$/stores/documentVersions'

function formatDocumentPath(path: string): string {
  // Remove .promptl extension if present
  const cleanPath = path.replace(/\.promptl$/, '')
  const segments = cleanPath.split('/')

  if (segments.length === 1) return segments[0]

  const filename = segments[segments.length - 1]
  const firstFolder = segments[0]

  if (segments.length === 2) {
    return `${firstFolder}/${filename}`
  }

  return `${firstFolder}/.../${filename}`
}

export function useDocuments() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: documents, isLoading } = useDocumentVersions({
    projectId: project?.id,
    commitUuid: commit?.uuid,
  })

  const documentOptions = useMemo(
    () =>
      documents?.map((doc) => ({
        value: doc.documentUuid,
        label: formatDocumentPath(doc.path),
      })),
    [documents],
  )

  return useMemo(
    () => ({
      documentOptions,
      isLoading,
    }),
    [documentOptions, isLoading],
  )
}
