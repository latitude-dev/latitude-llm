'use client'
import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { TabSelector } from '$/components/TabSelector'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  SelectContent,
  SelectRoot,
  SelectTrigger,
  SelectValueWithIcon,
} from '@latitude-data/web-ui/atoms/Select'
import CreateDraftCommitModal from '../CreateDraftCommitModal'
import PublishDraftCommitModal from '../PublishDraftCommitModal'
import { ArchivedCommitsList } from './ArchivedCommitsList'
import { ActiveCommitsList, getCommitTestInfo } from './ActiveCommitsList'
import { BadgeCommit, BadgeType } from './CommitItem'
import { DraftsCommitsList } from './DraftsCommitsList'
import DeleteDraftCommitModal from './DeleteDraftCommitModal'
import { OpenInDocsButton } from '$/components/Documentation/OpenInDocsButton'
import { DocsRoute } from '$/components/Documentation/routes'

import { HELP_CENTER } from '@latitude-data/core/constants'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'
const MIN_WIDTH_SELECTOR_PX = 380
const TRIGGER_X_PADDING_PX = 26

function useObserveSelectWidth(ref: RefObject<HTMLButtonElement | null>) {
  const [width, setWidth] = useState(MIN_WIDTH_SELECTOR_PX)
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const { width: triggerWidth } = entries[0]?.contentRect ?? { width: 0 }
      setWidth(
        Math.max(triggerWidth + TRIGGER_X_PADDING_PX, MIN_WIDTH_SELECTOR_PX),
      )
    })
    if (ref.current) {
      resizeObserver.observe(ref.current)
    }
    return () => {
      resizeObserver.disconnect()
    }
  }, [ref])

  return width
}

const BOTTOM_PADDING_PX = 32

function useCalculateMaxHeight() {
  const ref = useRef<HTMLButtonElement | null>(null)
  const [maxHeight, setMaxHeight] = useState<string | number>('auto')

  const calculateMaxHeight = useCallback(
    (open: boolean) => {
      const target = ref.current

      if (!target || !open) {
        setMaxHeight('auto')
        return
      }

      const { top, height } = target.getBoundingClientRect()
      const windowHeight = window.innerHeight
      const maxH = windowHeight - (top + height + BOTTOM_PADDING_PX)
      setMaxHeight(maxH)
    },
    [ref],
  )

  return { calculateMaxHeight, maxHeight, ref }
}

function CommitSelectorHeader({
  setOpen,
}: {
  setOpen: ReactStateDispatch<boolean>
}) {
  return (
    <>
      <div className='flex flex-col gap-y-4'>
        <div className='flex flex-row items-center justify-between'>
          <div className='flex flex-row items-center gap-2'>
            <Text.H4M>Versions</Text.H4M>
            <OpenInDocsButton route={DocsRoute.VersionControl} />
          </div>
          <Button fancy variant='outline' onClick={() => setOpen(true)}>
            New version
          </Button>
        </div>
        <Text.H6 color='foregroundMuted'>
          Versions allow you to stage changes ahead of release.{' '}
          <Text.H6 asChild color='accentForeground'>
            <a href={HELP_CENTER.commitVersions} target='_blank'>
              Learn more
            </a>
          </Text.H6>
          .
        </Text.H6>
      </div>
    </>
  )
}

export default function CommitSelector({
  headCommit,
  currentCommit,
  currentDocument,
  draftCommits,
  commitsInActiveTests,
  activeTests,
}: {
  headCommit?: Commit | undefined
  currentCommit: Commit
  currentDocument?: DocumentVersion
  draftCommits: Commit[]
  commitsInActiveTests: Commit[]
  activeTests: DeploymentTest[]
}) {
  const [open, setOpen] = useState(false)
  const { ref, maxHeight, calculateMaxHeight } = useCalculateMaxHeight()
  const width = useObserveSelectWidth(ref)
  const selected = useMemo(() => {
    return {
      commit: currentCommit,
      title: currentCommit.title ?? currentCommit.uuid,
      badgeType:
        currentCommit.id === headCommit?.id
          ? BadgeType.Head
          : currentCommit.mergedAt
            ? BadgeType.Merged
            : BadgeType.Draft,
    }
  }, [currentCommit, headCommit])
  const currentCommitTestInfo = useMemo(() => {
    return getCommitTestInfo(currentCommit.id, headCommit?.id, activeTests)
  }, [currentCommit.id, headCommit?.id, activeTests])
  const [publishCommit, setPublishCommit] = useState<number | null>(null)
  const [deleteCommit, setDeleteCommit] = useState<number | null>(null)
  const canPublish = !currentCommit.mergedAt
  const getInitialTab = (): 'active' | 'drafts' | 'archived' => {
    if (currentCommit.mergedAt && currentCommit.id !== headCommit?.id) {
      return 'archived'
    }
    // Check if current commit is head or in active tests
    const isHead = currentCommit.id === headCommit?.id
    const isInActiveTest = commitsInActiveTests.some(
      (c) => c.id === currentCommit.id,
    )
    if (isHead || isInActiveTest) {
      return 'active'
    }
    return 'drafts'
  }
  const [selectedTab, setSelectedTab] = useState<
    'active' | 'drafts' | 'archived'
  >(getInitialTab())

  return (
    <div className='flex flex-col gap-y-2'>
      <SelectRoot
        value={String(currentCommit.id)}
        onOpenChange={calculateMaxHeight}
      >
        <SelectTrigger ref={ref}>
          <SelectValueWithIcon
            icon={
              <BadgeCommit
                commit={currentCommit}
                isLive={currentCommit.id == headCommit?.id}
                testInfo={currentCommitTestInfo}
              />
            }
          >
            <Text.H5M ellipsis noWrap userSelect={false}>
              {selected.title}
            </Text.H5M>
          </SelectValueWithIcon>
        </SelectTrigger>
        <SelectContent
          autoScroll={false}
          maxHeightAuto
          className='flex flex-col gap-y-4 p-4 relative'
          style={{
            width,
            minWidth: MIN_WIDTH_SELECTOR_PX,
            maxHeight,
          }}
        >
          <CommitSelectorHeader setOpen={setOpen} />
          <TabSelector
            options={[
              { label: 'Active', value: 'active' },
              { label: 'Drafts', value: 'drafts' },
              { label: 'Archived', value: 'archived' },
            ]}
            selected={selectedTab}
            onSelect={setSelectedTab}
          />
          {selectedTab === 'active' ? (
            <ActiveCommitsList
              currentDocument={currentDocument}
              headCommit={headCommit}
              commitsInActiveTests={commitsInActiveTests}
              activeTests={activeTests}
              onCommitPublish={setPublishCommit}
              onCommitDelete={setDeleteCommit}
            />
          ) : selectedTab === 'drafts' ? (
            <DraftsCommitsList
              currentDocument={currentDocument}
              headCommit={headCommit}
              draftCommits={draftCommits}
              commitsInActiveTests={commitsInActiveTests}
              onCommitPublish={setPublishCommit}
              onCommitDelete={setDeleteCommit}
            />
          ) : (
            <ArchivedCommitsList
              currentDocument={currentDocument}
              headCommit={headCommit}
            />
          )}
        </SelectContent>
      </SelectRoot>
      {canPublish ? (
        <Button
          fancy
          fullWidth
          onClick={() => setPublishCommit(currentCommit.id)}
        >
          Deploy version
        </Button>
      ) : null}
      {currentCommit.mergedAt ? (
        <Button variant='outline' fullWidth onClick={() => setOpen(true)}>
          New version
        </Button>
      ) : null}
      <CreateDraftCommitModal
        open={open}
        setOpen={setOpen}
        currentDocument={currentDocument}
      />
      <DeleteDraftCommitModal
        commitId={deleteCommit}
        onClose={setDeleteCommit}
      />
      {publishCommit ? (
        <PublishDraftCommitModal
          commitId={publishCommit}
          onClose={setPublishCommit}
          headCommit={headCommit}
        />
      ) : null}
    </div>
  )
}
