'use client'

import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge, BadgeProps } from '@latitude-data/web-ui/atoms/Badge'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { formatDistanceToNow } from 'date-fns'
import { useCallback, useMemo, useState } from 'react'
import useDeploymentTests from '$/stores/deploymentTests'
import { useTestSelection } from './TestSelectionContext'
import { cn } from '@latitude-data/web-ui/utils'
import { useCommitsFromProject } from '$/stores/commitsStore'

const STATUS_COLORS: Record<string, BadgeProps['variant']> = {
  pending: 'yellow',
  running: 'outlineAccent',
  paused: 'yellow',
  completed: 'secondary',
  cancelled: 'destructive',
}

const TEST_TYPE_LABELS: Record<string, string> = {
  shadow: '🌑 Shadow Test',
  ab: '🔀 A/B Test',
}

type TestsListProps = {
  tests: DeploymentTest[]
  projectId: number
}

export function TestsList({ tests: _tests, projectId }: TestsListProps) {
  const {
    data: tests,
    pause,
    resume,
    stop,
    destroy,
  } = useDeploymentTests({ projectId }, { fallbackData: _tests })
  const { selection, selectTest } = useTestSelection()
  const [selectedTest, setSelectedTest] = useState<DeploymentTest>()
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const { data: commits = [] } = useCommitsFromProject(projectId)
  const challengerCommitMap = useMemo(() => {
    const map = new Map<number, string>()
    commits.forEach((commit) => {
      map.set(commit.id, commit.title || commit.uuid)
    })
    return map
  }, [commits])

  const handlePause = useCallback(
    (test: DeploymentTest) => {
      pause.execute(test.uuid)
    },
    [pause],
  )

  const handleResume = useCallback(
    (test: DeploymentTest) => {
      resume.execute(test.uuid)
    },
    [resume],
  )

  const handleStop = useCallback(
    (test: DeploymentTest) => {
      stop.execute(test.uuid)
    },
    [stop],
  )

  const handleDeleteClick = useCallback((test: DeploymentTest) => {
    setSelectedTest(test)
    setOpenDeleteModal(true)
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    if (!selectedTest) return
    destroy.execute(selectedTest.uuid)
    setOpenDeleteModal(false)
  }, [selectedTest, destroy])

  const canPause = (status: string) => status === 'running'
  const canResume = (status: string) => status === 'paused'
  const canStop = (status: string) =>
    status === 'running' || status === 'paused'

  const getMenuOptions = useCallback(
    (test: DeploymentTest) => {
      const options = []

      if (canPause(test.status)) {
        options.push({
          label: 'Pause',
          onClick: () => handlePause(test),
          onElementClick: (e: React.MouseEvent) => e.stopPropagation(),
          disabled: pause.isPending,
        })
      }

      if (canResume(test.status)) {
        options.push({
          label: 'Resume',
          onClick: () => handleResume(test),
          onElementClick: (e: React.MouseEvent) => e.stopPropagation(),
          disabled: resume.isPending,
        })
      }

      if (canStop(test.status)) {
        options.push({
          label: 'Stop',
          onClick: () => handleStop(test),
          onElementClick: (e: React.MouseEvent) => e.stopPropagation(),
          disabled: stop.isPending,
        })
      }

      options.push({
        label: 'Delete',
        type: 'destructive' as const,
        onClick: () => handleDeleteClick(test),
        onElementClick: (e: React.MouseEvent) => e.stopPropagation(),
        disabled: destroy.isPending,
      })

      return options
    },
    [
      handlePause,
      handleResume,
      handleStop,
      handleDeleteClick,
      pause.isPending,
      resume.isPending,
      stop.isPending,
      destroy.isPending,
    ],
  )

  const runningTests = useMemo(
    () => tests.filter((t) => t.status === 'running' || t.status === 'paused'),
    [tests],
  )

  const otherTests = useMemo(
    () => tests.filter((t) => t.status !== 'running' && t.status !== 'paused'),
    [tests],
  )

  const renderTestTable = (tableTests: DeploymentTest[], title?: string) => (
    <div className='flex flex-col gap-3'>
      {title && <Text.H5>{title}</Text.H5>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Challenger Commit</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableTests.map((test) => {
            const isSelected = selection.testUuid === test.uuid
            return (
              <TableRow
                key={test.id}
                className={cn('h-12', {
                  'cursor-pointer': true,
                  'bg-accent': isSelected,
                })}
                onClick={() => selectTest(test.uuid)}
              >
                <TableCell>
                  <Text.H5>{test.name}</Text.H5>
                </TableCell>
                <TableCell>
                  <Text.H5>{TEST_TYPE_LABELS[test.testType]}</Text.H5>
                </TableCell>
                <TableCell>
                  <Text.H5>
                    {challengerCommitMap.get(test.challengerCommitId) || 'N/A'}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_COLORS[test.status]}>
                    {test.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Text.H5>
                    {formatDistanceToNow(new Date(test.createdAt), {
                      addSuffix: true,
                    })}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <DropdownMenu
                    options={getMenuOptions(test)}
                    side='bottom'
                    align='end'
                    triggerButtonProps={{
                      className: 'border-none justify-end cursor-pointer',
                      onClick: (e) => e.stopPropagation(),
                    }}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )

  return (
    <>
      <div className='flex flex-col gap-6'>
        {runningTests.length > 0 && renderTestTable(runningTests, 'Running')}
        {otherTests.length > 0 && renderTestTable(otherTests, 'Completed')}
      </div>
      {openDeleteModal && selectedTest && (
        <ConfirmModal
          dismissible
          open={openDeleteModal}
          title={`Delete ${selectedTest.name}`}
          type='destructive'
          onOpenChange={setOpenDeleteModal}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setOpenDeleteModal(false)}
          confirm={{
            label: destroy.isPending ? 'Deleting...' : 'Delete',
            description:
              'Are you sure you want to delete this test? This action cannot be undone.',
            disabled: destroy.isPending,
            isConfirming: destroy.isPending,
          }}
        />
      )}
    </>
  )
}
