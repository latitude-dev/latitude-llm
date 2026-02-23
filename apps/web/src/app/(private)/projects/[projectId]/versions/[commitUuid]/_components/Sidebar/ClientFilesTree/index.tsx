'use client'

import { useCallback, useState } from 'react'

import useDocumentVersions from '$/stores/documentVersions'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'

import CreateDraftCommitModal from '../CreateDraftCommitModal'
import MergedCommitWarningModal from '../MergedCommitWarningModal'
import { FilesTree } from '$/components/Sidebar/Files'
import { SidebarDocument } from '$/components/Sidebar/Files/useTree'
import { HEAD_COMMIT } from '@latitude-data/core/constants'
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
  const [createDraftCommitModalOpen, setDraftCommitModalOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const documentUuid = currentDocument?.documentUuid
  const { data } = useDocumentVersions(
    { commitUuid: commit.uuid, projectId: project.id },
    {
      fallbackData: serverDocuments,
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
  useRunningDocuments({
    project,
    commit,
  })
  const onMergeCommitClick = useCallback(() => {
    setWarningOpen(true)
  }, [setWarningOpen])

  return (
    <>
      <FilesTree
        promptManagement={promptManagement}
        documents={data}
        currentUuid={documentUuid}
        onMergeCommitClick={onMergeCommitClick}
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
