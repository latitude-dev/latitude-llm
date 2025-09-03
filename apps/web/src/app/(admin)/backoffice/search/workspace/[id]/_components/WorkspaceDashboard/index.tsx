'use client'
import Link from 'next/link'

import { WorkspaceWithDetails } from '$/data-access'
import { ROUTES, BackofficeRoutes } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { DashboardHeader } from '$/app/(admin)/backoffice/search/_components/DashboardHeader'
import { BasicInfoList } from '$/app/(admin)/backoffice/search/_components/BasicInfoList'
import { DataTable } from '$/app/(admin)/backoffice/search/_components/DataTable'

type Props = {
  workspace: WorkspaceWithDetails
}

export function WorkspaceDashboard({ workspace }: Props) {
  const basicInfo = [
    {
      label: 'Workspace ID',
      value: workspace.id,
      monospace: true,
      icon: 'aLargeSmall' as const,
    },
    {
      label: 'Workspace Name',
      value: workspace.name,
      icon: 'house' as const,
    },
    {
      label: 'Created At',
      value: new Date(workspace.createdAt).toLocaleDateString(),
      icon: 'calendar' as const,
    },
  ]

  const breadcrumbs = [{ label: 'Workspace', href: undefined }]

  return (
    <div className='container mx-auto p-6 max-w-7xl'>
      <div className='space-y-8'>
        <DashboardHeader
          title={workspace.name}
          description={`Detailed information about workspace #${workspace.id}`}
          icon='house'
          breadcrumbs={breadcrumbs}
        />

        <BasicInfoList items={basicInfo} title='Workspace Information' />

        <div className='space-y-8'>
          <DataTable
            title='Active Feature Flags'
            count={workspace.features.length}
            columns={[{ header: 'Feature Name' }, { header: 'Description' }]}
            emptyMessage='No active feature flags'
            icon='sparkles'
          >
            {workspace.features.map((feature) => (
              <TableRow key={feature.id}>
                <TableCell className='p-2'>
                  <Text.H5 weight='medium'>{feature.name}</Text.H5>
                </TableCell>
                <TableCell>
                  <Text.H5 color='foregroundMuted'>
                    {feature.description || 'No description available'}
                  </Text.H5>
                </TableCell>
              </TableRow>
            ))}
          </DataTable>

          <DataTable
            title='Users'
            count={workspace.users.length}
            columns={[
              { header: 'User Information' },
              { header: 'Actions', flex: 'w-32' },
            ]}
            emptyMessage='No users found'
            icon='circleUser'
          >
            {workspace.users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className='p-2'>
                  <div className='flex items-center space-x-3'>
                    <div className='p-2 bg-accent rounded-lg'>
                      <Icon name='mail' size='small' color='primary' />
                    </div>
                    <div className='flex gap-2 items-center'>
                      <Text.H5 weight='medium' monospace>
                        {user.email}
                      </Text.H5>
                      <Text.H5 color='foregroundMuted'>
                        {user.name || 'No name provided'}
                      </Text.H5>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Link
                    href={ROUTES.backoffice[BackofficeRoutes.search].user(
                      user.email,
                    )}
                  >
                    <Button fancy variant='outline' size='small'>
                      <Text.H6B noWrap>View User</Text.H6B>
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </DataTable>

          <DataTable
            title='Projects'
            count={workspace.projects.length}
            columns={[
              { header: 'Project Information' },
              { header: 'Actions', flex: 'w-32' },
            ]}
            emptyMessage='No projects found'
            icon='folderOpen'
          >
            {workspace.projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <div className='flex items-center space-x-3'>
                    <div className='p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg'>
                      <Icon
                        name='folderOpen'
                        size='small'
                        color='latteOutputForeground'
                      />
                    </div>
                    <div className='flex gap-2 items-center'>
                      <Text.H5 color='foregroundMuted' monospace>
                        {project.id}
                      </Text.H5>
                      <Text.H5>{project.name}</Text.H5>
                    </div>
                  </div>
                </TableCell>
                <TableCell className='p-2'>
                  <Link
                    href={ROUTES.backoffice[BackofficeRoutes.search].project(
                      project.id,
                    )}
                  >
                    <Button fancy variant='outline' size='small'>
                      <Text.H6B noWrap>View Project</Text.H6B>
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        </div>
      </div>
    </div>
  )
}
