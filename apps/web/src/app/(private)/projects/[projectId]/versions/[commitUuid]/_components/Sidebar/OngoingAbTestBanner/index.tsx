'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'

export default function OngoingAbTestBanner({
  projectId,
  test,
  commitUuid,
}: {
  projectId: number
  test: DeploymentTest
  commitUuid: string
}) {
  return (
    <Link
      href={
        ROUTES.projects
          .detail({ id: projectId })
          .commits.detail({ uuid: commitUuid }).testing.root
      }
      className='block'
    >
      <div className='flex flex-col gap-y-1 bg-accent border border-accent-foreground/10 rounded-xl p-4 cursor-pointer hover:bg-yellow-100 transition-colors dark:bg-yellow-950 dark:border-yellow-800 dark:hover:bg-yellow-900'>
        <Text.H5M color='accentForeground'>A/B test in progress →</Text.H5M>
        <Text.H5 color='accentForeground'>
          {test.name || 'Unnamed test'} is currently running. Click to view
          results.
        </Text.H5>
      </div>
    </Link>
  )
}
