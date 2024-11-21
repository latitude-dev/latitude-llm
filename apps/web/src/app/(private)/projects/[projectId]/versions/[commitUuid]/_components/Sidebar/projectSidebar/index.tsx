'use client'

import {
  Icon,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

export default function ProjectSidebar() {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  return (
    <div className='flex flex-col gap-4'>
      <Text.H5M>Project</Text.H5M>
      <div className='flex flex-row gap-2 items-center pl-2'>
        <Icon name='folderClose' />
        <Link
          href={
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: commit.uuid }).logs.root
          }
        >
          <Text.H6M>Logs</Text.H6M>
        </Link>
      </div>
    </div>
  )
}
