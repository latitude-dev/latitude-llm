'use client'

import { useCallback } from 'react'

import { HEAD_COMMIT } from '@latitude-data/core/browser'
import {
  FilesTree,
  useCurrentCommit,
  useCurrentProject,
  type SidebarDocument,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useDocumentVersions from '$/stores/documentVersions'
import { useRouter } from 'next/navigation'

export default function ClientFilesTree({
  documents: serverDocuments,
  currentDocument,
}: {
  documents: SidebarDocument[]
  currentDocument: SidebarDocument | undefined
}) {
  const router = useRouter()
  const { commit, isHead } = useCurrentCommit()
  const { project } = useCurrentProject()
  const documentPath = currentDocument?.path
  const navigateToDocument = useCallback((documentUuid: string) => {
    router.push(
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: isHead ? HEAD_COMMIT : commit.uuid })
        .documents.detail({ uuid: documentUuid }).root,
    )
  }, [])
  const { createFile, destroyFile, destroyFolder, isDestroying, data } =
    useDocumentVersions({ currentDocument }, { fallbackData: serverDocuments })
  return (
    <FilesTree
      documents={data}
      currentPath={documentPath}
      navigateToDocument={navigateToDocument}
      createFile={createFile}
      destroyFile={destroyFile}
      destroyFolder={destroyFolder}
      isDestroying={isDestroying}
    />
  )
}
