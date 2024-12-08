'use client'

import {
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import { usePathname } from 'next/navigation'

import { SidebarLink } from './SidebarLink'

export default function ProjectSidebar() {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const pathname = usePathname()

  const tracesPath = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid }).traces.root

  const overviewPath = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid }).overview.root

  return (
    <div className='flex flex-col gap-2'>
      <div className='ml-4'>
        <Text.H5M>Project</Text.H5M>
      </div>
      <SidebarLink
        href={overviewPath}
        icon='barChart4'
        label='Overview'
        isSelected={pathname === overviewPath}
      />
      <SidebarLink
        href={tracesPath}
        icon='logs'
        label='Traces'
        isSelected={pathname === tracesPath}
      />
    </div>
  )
}
