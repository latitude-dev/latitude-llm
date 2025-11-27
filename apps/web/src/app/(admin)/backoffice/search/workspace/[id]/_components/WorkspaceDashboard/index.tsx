'use client'
import Link from 'next/link'

import { WorkspaceWithDetails } from '$/data-access'
import { BackofficeRoutes, ROUTES } from '$/services/routes'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'

import { BasicInfoList } from '$/app/(admin)/backoffice/search/_components/BasicInfoList'
import { DashboardHeader } from '$/app/(admin)/backoffice/search/_components/DashboardHeader'
import { DataTable } from '$/app/(admin)/backoffice/search/_components/DataTable'
import { ClearCacheButton } from '../ClearCacheButton'
import { ChangePlanButton } from '../ChangePlanButton'
import { ToggleIssuesUnlockedButton } from '../ToggleIssuesUnlockedButton'

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
    {
      label: 'Seats Limit',
      value: workspace.quotas.seats.toLocaleString(),
      icon: 'users' as const,
    },
    {
      label: 'Runs Limit',
      value: workspace.quotas.runs.toLocaleString(),
      icon: 'logs' as const,
    },
    {
      label: 'Credits Limit',
      value: workspace.quotas.credits.toLocaleString(),
      icon: 'coins' as const,
    },
    {
      label: 'Subscription Plan',
      value: workspace.subscription.plan,
      icon: 'blocks' as const,
    },
    {
      label: 'Billable Period',
      value: `${new Date(workspace.subscription.billableFrom).toLocaleDateString()} - ${new Date(workspace.subscription.billableAt).toLocaleDateString()}`,
      icon: 'rectangleHorizontal' as const,
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

        <div className='flex justify-between gap-2'>
          <ToggleIssuesUnlockedButton
            workspaceId={workspace.id}
            issuesUnlocked={workspace.issuesUnlocked}
          />
          <div className='flex gap-2'>
            <ChangePlanButton
              workspaceId={workspace.id}
              currentPlan={workspace.subscription.plan}
            />
            <ClearCacheButton workspaceId={workspace.id} />
          </div>
        </div>

        <DataTable
          title='Subscription History'
          count={workspace.subscriptions.length}
          columns={[
            { header: 'Plan' },
            { header: 'Started At' },
            { header: 'Ended At' },
          ]}
          emptyMessage='No subscriptions found'
          icon='blocks'
        >
          {workspace.subscriptions.map((subscription, index) => {
            // Since subscriptions are sorted by createdAt DESC (most recent first),
            // the previous subscription chronologically is at index - 1
            const previousSubscription = workspace.subscriptions[index - 1]
            const endDate = previousSubscription
              ? previousSubscription.createdAt
              : null

            return (
              <TableRow key={subscription.id}>
                <TableCell className='p-2'>
                  <div className='flex items-center space-x-3'>
                    <div className='p-2 bg-accent rounded-lg'>
                      <Icon name='blocks' size='small' color='primary' />
                    </div>
                    <Text.H5 weight='medium'>
                      {subscription.plan
                        .split('_')
                        .map(
                          (word) =>
                            word.charAt(0).toUpperCase() + word.slice(1),
                        )
                        .join(' ')}
                    </Text.H5>
                  </div>
                </TableCell>
                <TableCell>
                  <Text.H5 color='foregroundMuted'>
                    {new Date(subscription.createdAt).toLocaleDateString()}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <Text.H5 color='foregroundMuted'>
                    {endDate
                      ? new Date(endDate).toLocaleDateString()
                      : 'Current'}
                  </Text.H5>
                </TableCell>
              </TableRow>
            )
          })}
        </DataTable>

        <div className='space-y-8'>
          <DataTable
            title='Feature Flags'
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
            title='Grants'
            count={workspace.grants.length}
            columns={[
              { header: 'Type' },
              { header: 'Amount' },
              { header: 'Source' },
              { header: 'Expires At' },
              { header: 'Granted At' },
            ]}
            emptyMessage='No grants found'
            icon='circleGauge'
          >
            {workspace.grants.map((grant) => (
              <TableRow key={grant.id}>
                <TableCell className='p-2'>
                  <div className='flex items-center space-x-3'>
                    <div className='p-2 bg-accent rounded-lg'>
                      <Icon
                        name={
                          grant.type === 'seats'
                            ? 'users'
                            : grant.type === 'runs'
                              ? 'logs'
                              : grant.type === 'credits'
                                ? 'coins'
                                : 'circleGauge'
                        }
                        size='small'
                        color='primary'
                      />
                    </div>
                    <Text.H5 weight='medium'>
                      {grant.type.charAt(0).toUpperCase() + grant.type.slice(1)}
                    </Text.H5>
                  </div>
                </TableCell>
                <TableCell>
                  <div className='flex flex-col gap-1'>
                    <Text.H5 weight='medium'>
                      {grant.amount.toLocaleString()}
                    </Text.H5>
                    {grant.amount !== 'unlimited' &&
                      grant.balance !== grant.amount && (
                        <Text.H6 color='foregroundMuted'>
                          {grant.balance.toLocaleString()} left
                        </Text.H6>
                      )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className='flex flex-col gap-1'>
                    <ClickToCopy copyValue={grant.referenceId}>
                      <Badge variant='muted' size='small'>
                        {grant.referenceId}
                      </Badge>
                    </ClickToCopy>
                    <Text.H6 color='foregroundMuted' monospace>
                      {grant.source.charAt(0).toUpperCase() +
                        grant.source.slice(1)}
                    </Text.H6>
                  </div>
                </TableCell>
                <TableCell>
                  <Text.H5 color='foregroundMuted'>
                    {grant.expiresAt
                      ? new Date(grant.expiresAt).toLocaleDateString()
                      : '-'}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <Text.H5 color='foregroundMuted'>
                    {new Date(grant.createdAt).toLocaleDateString()}
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
