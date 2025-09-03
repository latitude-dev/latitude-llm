'use client'
import Link from 'next/link'

import { UserWithDetails } from '$/data-access'
import { ROUTES, BackofficeRoutes } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { ImpersonateUserButton } from '../ImpersonateUserButton'
import { DashboardHeader } from '$/app/(admin)/backoffice/search/_components/DashboardHeader'
import { BasicInfoList } from '$/app/(admin)/backoffice/search/_components/BasicInfoList'
import { DataTable } from '$/app/(admin)/backoffice/search/_components/DataTable'

type Props = {
  user: UserWithDetails
}

export function UserDashboard({ user }: Props) {
  const basicInfo = [
    {
      label: 'User ID',
      value: user.id,
      monospace: true,
      icon: 'aLargeSmall' as const,
    },
    {
      label: 'Email Address',
      value: user.email,
      monospace: true,
      icon: 'mail' as const,
    },
    {
      label: 'Display Name',
      value: user.name || 'Not provided',
      icon: 'circleUser' as const,
    },
  ]

  const breadcrumbs = [{ label: 'User', href: undefined }]

  return (
    <div className='container mx-auto p-6 max-w-6xl'>
      <div className='space-y-8'>
        <DashboardHeader
          title={user.email}
          description={`Detailed information about user account`}
          icon='circleUser'
          breadcrumbs={breadcrumbs}
          actions={<ImpersonateUserButton userEmail={user.email} />}
        />

        <BasicInfoList items={basicInfo} title='User Information' />

        <DataTable
          title='Associated Workspaces'
          count={user.workspaces.length}
          columns={[
            { header: 'Workspace Information' },
            { header: 'Actions', flex: 'w-32' },
          ]}
          emptyMessage='No workspaces found'
          icon='house'
        >
          {user.workspaces.map((workspace) => (
            <TableRow key={workspace.id}>
              <TableCell>
                <div className='flex items-center space-x-3'>
                  <div className='p-2 bg-green-100 dark:bg-green-900/30 rounded-lg'>
                    <Icon name='house' size='small' color='foreground' />
                  </div>
                  <div className='flex gap-2 items-center'>
                    <Text.H5 color='foregroundMuted' monospace>
                      {workspace.id}
                    </Text.H5>
                    <Text.H5 weight='medium'>{workspace.name}</Text.H5>
                  </div>
                </div>
              </TableCell>
              <TableCell className='p-2'>
                <Link
                  href={ROUTES.backoffice[BackofficeRoutes.search].workspace(
                    workspace.id,
                  )}
                >
                  <Button fancy variant='outline' size='small'>
                    <Text.H6B noWrap>View Workspace</Text.H6B>
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
    </div>
  )
}
