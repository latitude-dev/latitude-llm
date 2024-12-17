'use client'
import { ROUTES } from '$/services/routes'
import useDocumentVersion from '$/stores/useDocumentVersion'
import { Commit } from '@latitude-data/core/browser'
import {
  Button,
  Icon,
  Skeleton,
  SplitPane,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import Link from 'next/link'
import { BadgeCommit } from '../../../_components/Sidebar/CommitSelector/CommitItem'
import { useMemo, useState } from 'react'
import { CommitsList } from '../CommitsList'
import { CommitChangesList } from '../CommitChangesList'
import { ChangeDiffViewer } from '../ChangeDiffViewer'

function DocumentFilterBanner({
  documentUuid,
  removeFilter,
}: {
  documentUuid: string
  removeFilter: () => void
}) {
  const { project } = useCurrentProject()
  const { commit, isHead } = useCurrentCommit()
  const { data: document } = useDocumentVersion(documentUuid, {
    commitUuid: commit.uuid,
  })

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex flex-row items-center gap-1.5'>
        <Text.H5>Showing only history for</Text.H5>
        <Link
          href={
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: commit.uuid })
              .documents.detail({ uuid: documentUuid }).root
          }
          className='flex flex-row items-center gap-1.5 hover:underline'
        >
          <Icon name='file' color='primary' />
          {document ? (
            <Text.H5 color='primary'>{document.path}</Text.H5>
          ) : (
            <Skeleton height='h5' className='w-48' />
          )}
        </Link>
        <Text.H5>on</Text.H5>
        <BadgeCommit commit={commit as Commit} isLive={isHead} />
        <Text.H5M>{commit.title}</Text.H5M>
      </div>
      <div className='flex flex-row items-center'>
        <Button variant='link' className='p-0' onClick={removeFilter}>
          <div className='flex flex-row items-center gap-1.5 text-primary'>
            <Icon name='close' color='primary' size='small' />
            <Text.H6 color='primary'>Remove filter</Text.H6>
          </div>
        </Button>
      </div>
    </div>
  )
}

export function ProjectChanges({
  allCommits,
  documentCommits: _documentCommits,
  documentUuid: _documentUuid,
}: {
  allCommits: Commit[]
  documentCommits?: Commit[]
  documentUuid?: string
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const [selectedCommitId, setSelectedCommitId] = useState<number>(commit.id)
  const [selectedDocumentUuid, setSelectedDocumentUuid] = useState<
    string | undefined
  >(_documentUuid)

  const [documentCommits, setDocumentCommits] = useState<Commit[] | undefined>(
    _documentCommits,
  )
  const [documentUuid, setDocumentUuid] = useState<string | undefined>(
    _documentUuid,
  )

  const filteredCommits = useMemo(() => {
    return allCommits.filter((c) => {
      if (!c.mergedAt && c.id !== commit.id) return false
      if (!documentCommits) return true
      return documentCommits.some((dc) => dc.id === c.id)
    })
  }, [allCommits, documentCommits, commit])

  const removeFilter = () => {
    setDocumentCommits(undefined)
    setDocumentUuid(undefined)
    window.history.replaceState(
      window.history.state,
      '',
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid }).history.root,
    )
  }

  const selectedCommit = useMemo(() => {
    return allCommits.find((c) => c.id === selectedCommitId)
  }, [allCommits, selectedCommitId])

  return (
    <div className='w-full h-full flex flex-col relative'>
      <div className='py-4 pl-4 w-full flex flex-col gap-2'>
        <Text.H4M>Project History</Text.H4M>
        {!!documentCommits && documentUuid && (
          <DocumentFilterBanner
            documentUuid={documentUuid}
            removeFilter={removeFilter}
          />
        )}
      </div>
      <div className='flex flex-row w-full min-h-0 flex-grow max-w-full overflow-hidden'>
        <SplitPane
          direction='horizontal'
          initialPercentage={30}
          minSize={300}
          firstPane={
            <CommitsList
              commits={filteredCommits}
              selectedCommitId={selectedCommitId}
              selectCommitId={setSelectedCommitId}
            />
          }
          secondPane={
            <SplitPane
              direction='horizontal'
              visibleHandle={false}
              gap={2}
              initialPercentage={30}
              minSize={300}
              firstPane={
                <CommitChangesList
                  commit={selectedCommit!}
                  selectedDocumentUuid={selectedDocumentUuid}
                  selectDocumentUuid={setSelectedDocumentUuid}
                  currentDocumentUuid={documentUuid}
                />
              }
              secondPane={
                <div className='w-full h-full pr-4 pb-4'>
                  <ChangeDiffViewer
                    commit={selectedCommit}
                    documentUuid={selectedDocumentUuid}
                  />
                </div>
              }
            />
          }
        />
      </div>
    </div>
  )
}
