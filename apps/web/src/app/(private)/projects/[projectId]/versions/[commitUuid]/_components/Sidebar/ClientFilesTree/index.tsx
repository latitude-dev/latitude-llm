'use client'

import { useCallback, useMemo, useState } from 'react'

import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDocumentVersions from '$/stores/documentVersions'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'

import CreateDraftCommitModal from '../CreateDraftCommitModal'
import MergedCommitWarningModal from '../MergedCommitWarningModal'
import { FilesTree } from '$/components/Sidebar/Files'
import { SidebarDocument } from '$/components/Sidebar/Files/useTree'
import { HEAD_COMMIT } from '@latitude-data/core/constants'
import { useCommits } from '$/stores/commitsStore'
import { useRunningDocuments } from '$/stores/runs/runningDocuments'

export default function ClientFilesTree({
  promptManagement,
  documents: serverDocuments,
  liveDocuments: serverLiveDocuments,
  currentDocument,
}: {
  promptManagement: boolean
  documents: SidebarDocument[]
  liveDocuments?: SidebarDocument[]
  currentDocument: SidebarDocument | undefined
}) {
  const router = useNavigate()
  const [createDraftCommitModalOpen, setDraftCommitModalOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const { commit, isHead } = useCurrentCommit()
  const { setCommitMainDocument } = useCommits()
  const isMerged = !!commit.mergedAt
  const { project } = useCurrentProject()
  const documentUuid = currentDocument?.documentUuid
  const sidebarLinkContext = useMemo(
    () => ({
      projectId: project.id,
      commitUuid: isHead ? HEAD_COMMIT : commit.uuid,
    }),
    [project.id, commit.uuid, isHead],
  )
  const navigateToDocument = useCallback(
    (documentUuid: string) => {
      const documentDetails = ROUTES.projects
        .detail({ id: sidebarLinkContext.projectId })
        .commits.detail({ uuid: sidebarLinkContext.commitUuid })
        .documents.detail({ uuid: documentUuid })

      return router.push(documentDetails.root)
    },
    [sidebarLinkContext, router],
  )
  const { toast } = useToast()

  const {
    isLoading,
    createFile,
    uploadFile,
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
        if (!document) return // should never happen but it does

        toast({
          title: 'Success',
          description: 'Document created! 🎉',
        })

        navigateToDocument(document.documentUuid)
      },
    },
  )
  const { data: liveDocuments } = useDocumentVersions(
    {
      commitUuid: commit.mergedAt ? undefined : HEAD_COMMIT,
      projectId: commit.mergedAt ? undefined : project.id,
    },
    {
      fallbackData: serverLiveDocuments,
    },
  )
  const runningDocumentsMap = useRunningDocuments({
    project,
    commit,
  })
  const onMergeCommitClick = useCallback(() => {
    setWarningOpen(true)
  }, [setWarningOpen])

  const setMainDocumentUuid = useCallback(
    (documentUuid: string | undefined) => {
      if (isMerged) return onMergeCommitClick()

      setCommitMainDocument({
        projectId: project.id,
        commitId: commit.id,
        documentUuid,
      })
    },
    [
      setCommitMainDocument,
      project.id,
      commit.id,
      isMerged,
      onMergeCommitClick,
    ],
  )

  return (
    <>
      <FilesTree
        promptManagement={promptManagement}
        sidebarLinkContext={sidebarLinkContext}
        isLoading={isLoading}
        isMerged={isMerged}
        documents={data}
        mainDocumentUuid={commit.mainDocumentUuid ?? undefined}
        currentUuid={documentUuid}
        onMergeCommitClick={onMergeCommitClick}
        createFile={createFile}
        uploadFile={uploadFile}
        renamePaths={renamePaths}
        destroyFile={destroyFile}
        destroyFolder={destroyFolder}
        setMainDocumentUuid={setMainDocumentUuid}
        isDestroying={isDestroying}
        liveDocuments={commit.mergedAt ? undefined : liveDocuments}
        runningDocumentsMap={runningDocumentsMap}
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
