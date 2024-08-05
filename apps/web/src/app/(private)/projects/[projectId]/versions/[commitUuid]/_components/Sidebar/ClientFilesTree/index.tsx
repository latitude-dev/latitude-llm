'use client'

import { useCallback, useState } from 'react'

import { Commit, HEAD_COMMIT } from '@latitude-data/core/browser'
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
  headCommit,
  documents: serverDocuments,
  currentDocument,
}: {
  headCommit: Commit
  documents: SidebarDocument[]
  currentDocument: SidebarDocument | undefined
}) {
  const router = useNavigate()
  const [createDraftCommitModalOpen, setDraftCommitModalOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const { commit } = useCurrentCommit()
  const isMerged = !!commit.mergedAt
  const isHead = commit.id === headCommit.id
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
