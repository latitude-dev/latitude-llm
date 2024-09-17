'use client'

import { useCallback, useState } from 'react'

import { HEAD_COMMIT } from '@latitude-data/core/browser'
import {
  FilesTree,
  useCurrentCommit,
  useCurrentProject,
  type SidebarDocument,
} from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import useDocumentVersions from '$/stores/documentVersions'
import { useSelectedLayoutSegment } from 'next/navigation'

import CreateDraftCommitModal from '../CreateDraftCommitModal'
import MergedCommitWarningModal from '../MergedCommitWarningModal'

export default function ClientFilesTree({
  documents: serverDocuments,
  currentDocument,
}: {
  documents: SidebarDocument[]
  currentDocument: SidebarDocument | undefined
}) {
  const router = useNavigate()
  const [createDraftCommitModalOpen, setDraftCommitModalOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const { commit, isHead } = useCurrentCommit()
  const isMerged = !!commit.mergedAt
  const { project } = useCurrentProject()
  const documentPath = currentDocument?.path
  const selectedSegment = useSelectedLayoutSegment() as DocumentRoutes | null
  const navigateToDocument = useCallback(
    (documentUuid: string) => {
      const documentDetails = ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: isHead ? HEAD_COMMIT : commit.uuid })
        .documents.detail({ uuid: documentUuid })

      if (!selectedSegment) return router.push(documentDetails.root)
      router.push(documentDetails[selectedSegment].root)
    },
    [selectedSegment, project.id, commit.uuid, isHead],
  )

  const { createFile, destroyFile, destroyFolder, isDestroying, data } =
    useDocumentVersions(
      { commitUuid: commit.uuid, projectId: project.id },
      {
        fallbackData: serverDocuments,
        onSuccessCreate: (document) => {
          navigateToDocument(document.documentUuid)
        },
      },
    )
  const onMergeCommitClick = useCallback(() => {
    setWarningOpen(true)
  }, [setWarningOpen])

  return (
    <>
      <FilesTree
        isMerged={isMerged}
        documents={data}
        currentPath={documentPath}
        navigateToDocument={navigateToDocument}
        onMergeCommitClick={onMergeCommitClick}
        createFile={createFile}
        destroyFile={destroyFile}
        destroyFolder={destroyFolder}
        isDestroying={isDestroying}
      />
      <CreateDraftCommitModal
        open={createDraftCommitModalOpen}
        setOpen={setDraftCommitModalOpen}
      />
      <MergedCommitWarningModal
        open={warningOpen}
        setOpen={setWarningOpen}
        onConfirm={() => setDraftCommitModalOpen(true)}
      />
    </>
  )
}
