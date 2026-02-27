'use client'

import { useCallback } from 'react'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useAnnotationQueues } from '$/stores/annotationQueues/annotationQueuesList'
import { useAnnotationQueueStatusCounts } from '$/stores/annotationQueues/annotationQueueStatusCounts'
import { useAnnotationQueueMembers } from '$/stores/annotationQueues/annotationQueueMembers'
import { useMemberships } from '$/stores/memberships'
import { ROUTES } from '$/services/routes'
import { useNavigate } from '$/hooks/useNavigate'
import { timeAgo } from '$/lib/relativeTime'
import { getUserInfoFromSession } from '$/lib/getUserInfo'
import { AnnotationQueue } from '@latitude-data/core/schema/models/types/AnnotationQueue'
import { AnnotationQueueMember } from '@latitude-data/core/schema/models/types/AnnotationQueue'
import { MembershipWithUser } from '@latitude-data/core/queries/memberships/findAll'
import { Avatar } from '@latitude-data/web-ui/atoms/Avatar'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'

function AssignedToCell({
  queueMembers,
  membershipsById,
}: {
  queueMembers?: AnnotationQueueMember[]
  membershipsById: Map<number, MembershipWithUser>
}) {
  if (!queueMembers?.length) return null

  const queueMember = queueMembers[0]!
  const membership = membershipsById.get(queueMember.membershipId)
  if (!membership) return null

  const { name, fallback } = getUserInfoFromSession({
    name: membership.userName,
  })

  return (
    <div className='flex flex-row items-center gap-2'>
      <Avatar
        alt={name}
        fallback={fallback}
        className='w-8 h-8 flex-shrink-0'
      />
      <div className='flex flex-col'>
        <Text.H5M noWrap>{name}</Text.H5M>
        <Text.H6 color='foregroundMuted' noWrap suppressHydrationWarning>
          {timeAgo({ input: queueMember.createdAt })}
        </Text.H6>
      </div>
    </div>
  )
}

function QueueRowSkeleton() {
  return (
    <TableRow className='border-b-[0.5px] h-12 max-h-12 border-border'>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton height='h5' className='w-20' />
        </TableCell>
      ))}
    </TableRow>
  )
}

export function AnnotationQueuesList() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const navigate = useNavigate()
  const {
    data: queues,
    count,
    hasNext,
    hasPrev,
    goToNextPage,
    goToPrevPage,
    isLoading: isLoadingQueues,
  } = useAnnotationQueues({ projectId: project.id })
  const { data: statusCounts, isLoading: isLoadingCounts } =
    useAnnotationQueueStatusCounts({ projectId: project.id })
  const { membersByQueue, isLoading: isLoadingQueueMembers } =
    useAnnotationQueueMembers({ projectId: project.id })
  const { byId: membershipsById, isLoading: isLoadingMemberships } =
    useMemberships()

  const isLoading =
    isLoadingQueues ||
    isLoadingCounts ||
    isLoadingQueueMembers ||
    isLoadingMemberships

  const handleRowClick = useCallback(
    (queue: AnnotationQueue) => () => {
      const route = ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid })
        .annotationQueues.detail({ queueId: queue.id }).root
      navigate.push(route)
    },
    [project.id, commit.uuid, navigate],
  )

  const noData = !isLoading && queues.length === 0

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-4 min-w-0'>
      <TableWithHeader
        title='Annotation Queues'
        description='All finished runs'
        table={
          noData ? (
            <TableBlankSlate description='No annotation queues in this project yet' />
          ) : (
            <Table
              externalFooter={
                <SimpleKeysetTablePaginationFooter
                  hasNext={hasNext}
                  hasPrev={hasPrev}
                  setNext={goToNextPage}
                  setPrev={goToPrevPage}
                  count={count}
                  countLabel={(c) => `${c} ${c === 1 ? 'queue' : 'queues'}`}
                  isLoading={isLoading}
                />
              }
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created at</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <QueueRowSkeleton key={i} />
                    ))
                  : queues.map((queue) => {
                      const counts = statusCounts[queue.id]
                      const completed = counts?.completed ?? 0
                      const pending = counts?.pending ?? 0
                      return (
                        <TableRow
                          key={queue.id}
                          onClick={handleRowClick(queue)}
                          className='cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border hover:bg-secondary'
                        >
                          <TableCell>
                            <Text.H5 noWrap>{queue.name}</Text.H5>
                          </TableCell>
                          <TableCell>
                            <Text.H5
                              color='foregroundMuted'
                              noWrap
                              suppressHydrationWarning
                            >
                              {timeAgo({ input: queue.createdAt })}
                            </Text.H5>
                          </TableCell>
                          <TableCell>
                            <AssignedToCell
                              queueMembers={membersByQueue[queue.id]}
                              membershipsById={membershipsById}
                            />
                          </TableCell>
                          <TableCell>
                            <Text.H5>{completed}</Text.H5>
                          </TableCell>
                          <TableCell>
                            <Text.H5>{pending}</Text.H5>
                          </TableCell>
                        </TableRow>
                      )
                    })}
              </TableBody>
            </Table>
          )
        }
      />
    </div>
  )
}
