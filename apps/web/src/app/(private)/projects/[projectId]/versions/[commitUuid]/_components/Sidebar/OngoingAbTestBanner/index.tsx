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
      <div className='flex flex-col gap-y-1 bg-yellow border border-yellow-200 rounded-xl p-4 cursor-pointer'>
        <Text.H5M color='warningForeground'>A/B test in progress →</Text.H5M>
        <Text.H5 color='warningForeground'>
          {test.name || 'Unnamed test'} is currently running. Click to view
          results.
        </Text.H5>
      </div>
    </Link>
  )
}
