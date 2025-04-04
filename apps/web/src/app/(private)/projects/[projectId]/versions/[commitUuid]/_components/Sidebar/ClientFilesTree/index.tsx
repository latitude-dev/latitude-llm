'use client'
import { useCallback, useMemo, useState } from 'react'

import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDocumentVersions from '$/stores/documentVersions'
import { HEAD_COMMIT } from '@latitude-data/core/browser'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'

import CreateDraftCommitModal from '../CreateDraftCommitModal'
import MergedCommitWarningModal from '../MergedCommitWarningModal'
import { FilesTree } from '$/components/Sidebar/Files'
import { SidebarDocument } from '$/components/Sidebar/Files/useTree'

export default function ClientFilesTree({
  documents: serverDocuments,
  liveDocuments: serverLiveDocuments,
  currentDocument,
}: {
  documents: SidebarDocument[]
  liveDocuments?: SidebarDocument[]
  currentDocument: SidebarDocument | undefined
}) {
  const router = useNavigate()
  const [createDraftCommitModalOpen, setDraftCommitModalOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const { commit, isHead } = useCurrentCommit()
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
    [sidebarLinkContext],
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
  const onMergeCommitClick = useCallback(() => {
    setWarningOpen(true)
  }, [setWarningOpen])

  return (
    <>
      <FilesTree
        sidebarLinkContext={sidebarLinkContext}
        isLoading={isLoading}
        isMerged={isMerged}
        documents={data}
        currentUuid={documentUuid}
        onMergeCommitClick={onMergeCommitClick}
        createFile={createFile}
        uploadFile={uploadFile}
        renamePaths={renamePaths}
        destroyFile={destroyFile}
        destroyFolder={destroyFolder}
        isDestroying={isDestroying}
        liveDocuments={commit.mergedAt ? undefined : liveDocuments}
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
