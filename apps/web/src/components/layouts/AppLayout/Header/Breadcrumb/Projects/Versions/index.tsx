import { useMemo } from 'react'

import { Commit, HEAD_COMMIT } from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import {
  BreadcrumbItem,
  BreadcrumbSeparator,
} from '@latitude-data/web-ui/molecules/Breadcrumb'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { BreadcrumbItemSkeleton } from '@latitude-data/web-ui/molecules/Breadcrumb'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { useCommitsFromProject } from '$/stores/commitsStore'

export function CommitBreadcrumbItems({
  segments,
  projectId,
}: {
  segments: string[]
  projectId: number
}) {
  const commitUuid = segments[0]!

  const { data: commits, isLoading } = useCommitsFromProject(projectId, {
    commitStatus: undefined,
  })

  const headCommit = useMemo<Commit | undefined>(() => {
    if (!commits) return undefined
    return commits.reduce<Commit | undefined>((acc, c) => {
      if (!acc) return c
      if (!acc.mergedAt) return c
      if (c.mergedAt && acc.mergedAt < c.mergedAt) return c
      return acc
    }, undefined)
  }, [commits])

  const currentCommit = useMemo(() => {
    if (!commits) return undefined
    if (commitUuid === HEAD_COMMIT) return headCommit
    return commits.find((c) => c.uuid === commitUuid)
  }, [commits, headCommit, commitUuid])

  return (
    <>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        {isLoading ? (
          <BreadcrumbItemSkeleton />
        ) : (
          <div className='flex flex-row w-full justify-between overflow-hidden'>
            <Text.H5 color='foregroundMuted' noWrap ellipsis>
              {currentCommit?.title ?? commitUuid}
            </Text.H5>
            <ClickToCopy
              copyValue={currentCommit?.uuid ?? commitUuid}
              tooltipContent='Click to copy the version UUID'
            >
              <Badge
                variant={currentCommit?.mergedAt ? 'accent' : 'muted'}
                className='ml-2'
              >
                {commitUuid === HEAD_COMMIT
                  ? 'Live'
                  : currentCommit?.mergedAt
                    ? `v${currentCommit.version}`
                    : commitUuid.split('-')[0]}
              </Badge>
            </ClickToCopy>
          </div>
        )}
      </BreadcrumbItem>
    </>
  )
}
