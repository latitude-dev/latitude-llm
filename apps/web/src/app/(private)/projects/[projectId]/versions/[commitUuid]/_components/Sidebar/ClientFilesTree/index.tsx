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
import { useRouter } from 'next/navigation'

export default function ClientFilesTree({
  documents,
  documentPath,
}: {
  documents: SidebarDocument[]
  documentPath: string | undefined
  documentUuid: string | undefined
}) {
  const router = useRouter()
  const { commit, isHead } = useCurrentCommit()
  const { project } = useCurrentProject()

  const navigateToDocument = useCallback((documentUuid: string) => {
    router.push(
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: isHead ? HEAD_COMMIT : commit.uuid })
        .documents.detail({ uuid: documentUuid }).root,
    )
  }, [])

  return (
    <FilesTree
      documents={documents}
      currentPath={documentPath}
      navigateToDocument={navigateToDocument}
    />
  )
}
