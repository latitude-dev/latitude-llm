'use client'
import { ROUTES } from '$/services/routes'
import useDocumentVersion from '$/stores/useDocumentVersion'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CommitsList } from '../CommitsList'
import { CommitChangesList } from '../CommitChangesList'
import { ChangeDiffViewer } from '../ChangeDiffViewer'
import { HistoryActionModal, HistoryActionModalProvider } from '../ActionModal'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'

function DocumentFilterBanner({
  documentUuid,
  removeFilter,
}: {
  documentUuid: string
  removeFilter: () => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: document } = useDocumentVersion({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid,
  })

  return (
    <div className='flex flex-col flex-shrink-0 gap-2 p-2 truncate border border-border rounded-md bg-secondary'>
      <div className='inline-flex flex-wrap items-center gap-2'>
        <Text.H6>Showing only history for</Text.H6>
        <Link
          href={
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: commit.uuid })
              .documents.detail({ uuid: documentUuid }).root
          }
          className='inline-flex items-center'
        >
          <Button
            variant='link'
            className='py-0 bg-primary/10'
            iconProps={{ name: 'file', color: 'primary' }}
          >
            {document ? (
              <Text.H6 color='primary'>{document.path}</Text.H6>
            ) : (
              <Skeleton height='h6' className='w-48' />
            )}
          </Button>
        </Link>
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
    <HistoryActionModalProvider>
      <div className='w-full h-full flex flex-col relative'>
        <div className='flex flex-row w-full min-h-0 flex-grow max-w-full overflow-hidden'>
          <SplitPane
            direction='horizontal'
            initialPercentage={30}
            minSize={150}
            autoResize
            firstPane={
              <CommitsList
                commits={filteredCommits}
                selectedCommitId={selectedCommitId}
                selectCommitId={setSelectedCommitId}
                banner={
                  !!documentCommits &&
                  documentUuid && (
                    <DocumentFilterBanner
                      documentUuid={documentUuid}
                      removeFilter={removeFilter}
                    />
                  )
                }
              />
            }
            secondPane={
              <SplitPane
                direction='horizontal'
                visibleHandle={false}
                initialPercentage={40}
                minSize={150}
                autoResize
                firstPane={
                  <CommitChangesList
                    commit={selectedCommit!}
                    selectedDocumentUuid={selectedDocumentUuid}
                    selectDocumentUuid={setSelectedDocumentUuid}
                    currentDocumentUuid={documentUuid}
                  />
                }
                secondPane={
                  <div className='w-full h-full pr-4 py-4'>
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
      <HistoryActionModal />
    </HistoryActionModalProvider>
  )
}
