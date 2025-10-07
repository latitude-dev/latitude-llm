import { useLatteStore } from '$/stores/latte/index'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCallback } from 'react'
import { useDocumentValueMaybe } from '../useDocumentValueContext'
import useLatteThreadCheckpoints from '$/stores/latteThreadCheckpoints'
import { useCurrentDocumentMaybe } from '$/app/providers/DocumentProvider'
import useDocumentVersions from '$/stores/documentVersions'

export function useUpdateLocalState() {
  const { project } = useCurrentProject()
  const { threadUuid } = useLatteStore()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocumentMaybe()
  const { updateDocumentContent } = useDocumentValueMaybe()
  const { mutate: mutateCheckpoints } = useLatteThreadCheckpoints({
    threadUuid,
    commitId: commit.id,
  })
  const { mutate: mutateDocuments } = useDocumentVersions({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  return useCallback(async () => {
    // Update latte thread checkpoints
    mutateCheckpoints()

    // Update documents state
    const documents = await mutateDocuments()
    const d = documents?.find((d) => d.documentUuid === document.documentUuid)
    if (d) updateDocumentContent?.(d.content)
  }, [document, mutateCheckpoints, mutateDocuments, updateDocumentContent])
}
