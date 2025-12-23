'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { ROUTES } from '$/services/routes'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import Link from 'next/link'

export function VersionBadge({
  commit,
  isPending,
  isFinished,
  hasError,
  showTitle = true,
}: {
  commit?: Commit
  isPending?: boolean
  isFinished?: boolean
  hasError?: boolean
  showTitle?: boolean
}) {
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  if (commit) {
    const href = ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid }).editor.root

    return (
      <div className='flex flex-row gap-2 items-center truncate'>
        <Link href={href} target='_blank' onClick={(e) => e.stopPropagation()}>
          <Badge variant={commit.version ? 'accent' : 'muted'}>
            <div className='flex flex-row gap-1 items-center'>
              <Text.H6 noWrap userSelect={false}>
                {commit.version ? `v${commit.version}` : 'Draft'}
              </Text.H6>
              <Icon name='externalLink' size='small' className='shrink-0' />
            </div>
          </Badge>
        </Link>
        {showTitle && (
          <Text.H5
            noWrap
            ellipsis
            color={hasError ? 'destructive' : 'foreground'}
            userSelect={false}
          >
            {commit.title}
          </Text.H5>
        )}
      </div>
    )
  }

  if (isFinished) {
    return (
      <Tooltip
        asChild
        trigger={
          <Badge variant='outlineMuted' disabled>
            <Text.H6
              color={hasError ? 'destructive' : 'foregroundMuted'}
              userSelect={false}
            >
              Unknown
            </Text.H6>
          </Badge>
        }
        align='center'
        side='top'
        delayDuration={750}
      >
        Version was deleted
      </Tooltip>
    )
  }

  if (isPending) {
    return <Skeleton height='h5' className='w-36 rounded-md' />
  }

  return (
    <Text.H5
      color={hasError ? 'destructive' : 'foregroundMuted'}
      userSelect={false}
    >
      -
    </Text.H5>
  )
}
