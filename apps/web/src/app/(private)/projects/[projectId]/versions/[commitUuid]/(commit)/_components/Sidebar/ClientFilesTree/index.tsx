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
import { ROUTES } from '$/services/routes'
import useDocumentVersions from '$/stores/documentVersions'

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
  const documentUuid = currentDocument?.documentUuid
  const navigateToDocument = useCallback(
    (documentUuid: string) => {
      const documentDetails = ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: isHead ? HEAD_COMMIT : commit.uuid })
        .documents.detail({ uuid: documentUuid })

      return router.push(documentDetails.root)
    },
    [project.id, commit.uuid, isHead],
  )

  const {
    createFile,
    destroyFile,
    destroyFolder,
    renamePaths,
    isDestroying,
    data,
  } = useDocumentVersions(
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
        currentUuid={documentUuid}
        navigateToDocument={navigateToDocument}
        onMergeCommitClick={onMergeCommitClick}
        createFile={createFile}
        renamePaths={renamePaths}
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
