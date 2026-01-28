'use client'
import Link from 'next/link'
import { useState, useEffect, ReactNode } from 'react'

import { UserWithDetails } from '$/data-access'
import { ROUTES, BackofficeRoutes } from '$/services/routes'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { FREE_PLANS } from '@latitude-data/core/plans'

import { ImpersonateUserButton } from '../ImpersonateUserButton'
import { UpdateEmailModal } from '../UpdateEmailModal'
import { DashboardHeader } from '$/app/(admin)/backoffice/search/_components/DashboardHeader'
import { DataTable } from '$/app/(admin)/backoffice/search/_components/DataTable'
import { useRecentSearches } from '$/app/(admin)/backoffice/search/_hooks/useRecentSearches'

type Props = {
  user: UserWithDetails
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: IconName
  label: string
  value: string | number | ReactNode
  sublabel?: string
}) {
  return (
    <div className='flex flex-col gap-1 p-4 bg-muted/30 rounded-lg'>
      <div className='flex flex-row items-center gap-2'>
        <Icon name={icon} size='small' color='foregroundMuted' />
        <Text.H6 color='foregroundMuted'>{label}</Text.H6>
      </div>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text.H3>{value}</Text.H3>
      ) : (
        value
      )}
      {sublabel && <Text.H6 color='foregroundMuted'>{sublabel}</Text.H6>}
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  actions,
}: {
  icon: IconName
  title: string
  actions?: ReactNode
}) {
  return (
    <div className='flex flex-row items-center justify-between'>
      <div className='flex flex-row items-center gap-3'>
        <div className='p-2 bg-accent rounded-lg'>
          <Icon name={icon} size='normal' color='primary' />
        </div>
        <Text.H3>{title}</Text.H3>
      </div>
      {actions}
    </div>
  )
}

function formatPlanName(plan: string): string {
  return plan
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function UserDashboard({ user }: Props) {
  const [isUpdateEmailModalOpen, setIsUpdateEmailModalOpen] = useState(false)
  const [showAdminTools, setShowAdminTools] = useState(false)
  const { addRecentItem } = useRecentSearches()

  useEffect(() => {
    addRecentItem({
      type: 'user',
      id: user.email,
      label: user.email,
      sublabel: user.name || undefined,
    })
  }, [user.email, user.name, addRecentItem])

  const breadcrumbs = [{ label: 'User', href: undefined }]

  const paidWorkspaces = user.workspaces.filter(
    (w) => !FREE_PLANS.includes(w.plan as any),
  )
  const isEmailConfirmed = user.confirmedAt !== null

  return (
    <div className='container mx-auto p-6 max-w-7xl'>
      <div className='flex flex-col gap-8'>
        {/* Header */}
        <DashboardHeader
          title={user.email}
          description={user.name || 'No display name'}
          icon='circleUser'
          breadcrumbs={breadcrumbs}
          actions={<ImpersonateUserButton userEmail={user.email} />}
        />

        {/* Section 1: Quick Overview */}
        <Card className='p-6'>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-row items-center justify-between'>
              <div className='flex flex-row items-center gap-3'>
                {user.admin && (
                  <Badge variant='accent'>
                    <div className='flex flex-row items-center gap-1'>
                      <Icon name='shieldAlert' size='small' />
                      Admin
                    </div>
                  </Badge>
                )}
                {isEmailConfirmed ? (
                  <Badge variant='successMuted'>Email Confirmed</Badge>
                ) : (
                  <Badge variant='warningMuted'>Email Not Confirmed</Badge>
                )}
              </div>
              <ClickToCopy copyValue={user.id}>
                <Text.H6 color='foregroundMuted' monospace>
                  ID: {user.id.slice(0, 8)}...
                </Text.H6>
              </ClickToCopy>
            </div>
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
              <StatCard
                icon='house'
                label='Workspaces'
                value={user.workspaces.length}
              />
              <StatCard
                icon='creditCard'
                label='Paid Workspaces'
                value={paidWorkspaces.length}
              />
              <StatCard
                icon='calendar'
                label='Created'
                value={new Date(user.createdAt).toLocaleDateString()}
              />
              <StatCard
                icon='check'
                label='Confirmed'
                value={
                  user.confirmedAt ? (
                    <Text.H5>
                      {new Date(user.confirmedAt).toLocaleDateString()}
                    </Text.H5>
                  ) : (
                    <Text.H5 color='foregroundMuted'>Not confirmed</Text.H5>
                  )
                }
              />
            </div>
          </div>
        </Card>

        {/* Section 2: User Profile */}
        <Card className='p-6'>
          <div className='flex flex-col gap-6'>
            <SectionHeader icon='circleUser' title='User Profile' />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div className='flex flex-col gap-2 p-4 bg-muted/30 rounded-lg'>
                <Text.H6 color='foregroundMuted'>Email Address</Text.H6>
                <ClickToCopy copyValue={user.email}>
                  <Text.H4 monospace>{user.email}</Text.H4>
                </ClickToCopy>
              </div>
              <div className='flex flex-col gap-2 p-4 bg-muted/30 rounded-lg'>
                <Text.H6 color='foregroundMuted'>Display Name</Text.H6>
                <Text.H4>{user.name || 'Not provided'}</Text.H4>
              </div>
              <div className='flex flex-col gap-2 p-4 bg-muted/30 rounded-lg'>
                <Text.H6 color='foregroundMuted'>User ID</Text.H6>
                <ClickToCopy copyValue={user.id}>
                  <Text.H5 monospace>{user.id}</Text.H5>
                </ClickToCopy>
              </div>
              <div className='flex flex-col gap-2 p-4 bg-muted/30 rounded-lg'>
                <Text.H6 color='foregroundMuted'>Account Status</Text.H6>
                <div className='flex flex-row items-center gap-2'>
                  {user.admin && <Badge variant='accent'>Admin</Badge>}
                  {isEmailConfirmed ? (
                    <Badge variant='successMuted'>Confirmed</Badge>
                  ) : (
                    <Badge variant='warningMuted'>Unconfirmed</Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Section 3: Workspaces */}
        <Card className='p-6'>
          <div className='flex flex-col gap-6'>
            <SectionHeader icon='house' title='Workspaces' />

            <DataTable
              title={`Associated Workspaces (${user.workspaces.length})`}
              count={user.workspaces.length}
              columns={[
                { header: 'Workspace' },
                { header: 'Plan' },
                { header: 'Actions', flex: 'w-32' },
              ]}
              emptyMessage='No workspaces'
              noCard
            >
              {user.workspaces.map((workspace) => {
                const isFreePlan = FREE_PLANS.includes(workspace.plan as any)
                return (
                  <TableRow key={workspace.id}>
                    <TableCell className='p-2'>
                      <div className='flex flex-row items-center gap-3'>
                        <div className='p-2 bg-green-100 dark:bg-green-900/30 rounded-lg'>
                          <Icon name='house' size='small' color='foreground' />
                        </div>
                        <div className='flex flex-row items-center gap-2'>
                          <Text.H6 color='foregroundMuted' monospace>
                            #{workspace.id}
                          </Text.H6>
                          <Text.H5>{workspace.name}</Text.H5>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={isFreePlan ? 'muted' : 'accent'}
                        size='small'
                      >
                        {formatPlanName(workspace.plan)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={ROUTES.backoffice[
                          BackofficeRoutes.search
                        ].workspace(workspace.id)}
                      >
                        <Button variant='outline' size='small'>
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </DataTable>
          </div>
        </Card>

        {/* Section 4: Admin Tools */}
        <Card className='p-6'>
          <div className='flex flex-col gap-4'>
            <button
              onClick={() => setShowAdminTools(!showAdminTools)}
              className='flex flex-row items-center justify-between w-full'
            >
              <div className='flex flex-row items-center gap-3'>
                <div className='p-2 bg-accent rounded-lg'>
                  <Icon name='settings' size='normal' color='primary' />
                </div>
                <Text.H3>Admin Tools</Text.H3>
              </div>
              <Icon
                name='chevronRight'
                size='normal'
                color='foregroundMuted'
                className={`transition-transform ${showAdminTools ? 'rotate-90' : ''}`}
              />
            </button>

            {showAdminTools && (
              <div className='flex flex-col gap-4 pt-4 border-t border-border'>
                <div className='flex flex-row items-center justify-between p-4 bg-muted/30 rounded-lg'>
                  <div className='flex flex-col gap-1'>
                    <Text.H5>Update Email</Text.H5>
                    <Text.H6 color='foregroundMuted'>
                      Change the user's email address
                    </Text.H6>
                  </div>
                  <Button
                    variant='outline'
                    size='small'
                    onClick={() => setIsUpdateEmailModalOpen(true)}
                  >
                    Update Email
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Modal */}
        <UpdateEmailModal
          open={isUpdateEmailModalOpen}
          onOpenChange={setIsUpdateEmailModalOpen}
          currentEmail={user.email}
        />
      </div>
    </div>
  )
}
