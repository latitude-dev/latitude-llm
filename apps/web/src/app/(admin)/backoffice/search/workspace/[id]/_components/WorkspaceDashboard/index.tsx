'use client'
import Link from 'next/link'
import { useState, useEffect, ReactNode } from 'react'

import { WorkspaceWithDetails } from '$/data-access'
import { BackofficeRoutes, ROUTES } from '$/services/routes'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { FREE_PLANS } from '@latitude-data/core/plans'
import { Grant, GrantSource } from '@latitude-data/core/constants'
import { useGrantsAdmin } from '$/stores/admin/grants'
import { useWorkspaceLimitsAdmin } from '$/stores/admin/workspaceLimits'

import { DashboardHeader } from '$/app/(admin)/backoffice/search/_components/DashboardHeader'
import { DataTable } from '$/app/(admin)/backoffice/search/_components/DataTable'
import { ClearCacheButton } from '../ClearCacheButton'
import { ChangePlanButton } from '../ChangePlanButton'
import { BigAccountBanner } from '../BigAccountBanner'
import { DeleteWorkspaceButton } from '../DeleteWorkspaceButton'
import { IssueGrantModal } from '../IssueGrantModal'
import { WeeklyEmailModal } from '../WeeklyEmailModal'
import { WorkspaceWorkersUsage } from '../WorkspaceWorkersUsage'
import { ChangeTrialEndDateButton } from '../ChangeTrialEndDateButton'
import { SubscriptionRow } from '$/components/Subscriptions/SubscriptionRow'
import { useRecentSearches } from '$/app/(admin)/backoffice/search/_hooks/useRecentSearches'
import { ProductAccessToggles } from '../ProductAccessToggles'

type Props = {
  workspace: WorkspaceWithDetails
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: IconName
  label: string
  value: string | number
  sublabel?: string
}) {
  return (
    <div className='flex flex-col gap-1 p-4 bg-muted/30 rounded-lg'>
      <div className='flex flex-row items-center gap-2'>
        <Icon name={icon} size='small' color='foregroundMuted' />
        <Text.H6 color='foregroundMuted'>{label}</Text.H6>
      </div>
      <Text.H3>{value}</Text.H3>
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

function UsageLimitBar({
  label,
  icon,
  used,
  limit,
}: {
  label: string
  icon: IconName
  used: number
  limit: number | 'unlimited'
}) {
  const isUnlimited = limit === 'unlimited'
  const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100)
  const isHighUsage = percentage > 80

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-row items-center justify-between'>
        <div className='flex flex-row items-center gap-2'>
          <Icon name={icon} size='small' color='foregroundMuted' />
          <Text.H5>{label}</Text.H5>
        </div>
        <Text.H5 color={isHighUsage ? 'destructive' : 'foregroundMuted'}>
          {isUnlimited
            ? 'Unlimited'
            : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
        </Text.H5>
      </div>
      {!isUnlimited && (
        <div className='h-2 bg-muted rounded-full overflow-hidden'>
          <div
            className={`h-full rounded-full transition-all ${
              isHighUsage ? 'bg-destructive' : 'bg-primary'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function WorkspaceDashboard({ workspace }: Props) {
  const [isIssueGrantModalOpen, setIsIssueGrantModalOpen] = useState(false)
  const [isWeeklyEmailModalOpen, setIsWeeklyEmailModalOpen] = useState(false)
  const [openRevokeModal, setOpenRevokeModal] = useState(false)
  const [selectedGrant, setSelectedGrant] = useState<Grant>()
  const [showAdminTools, setShowAdminTools] = useState(false)
  const { addRecentItem } = useRecentSearches()

  useEffect(() => {
    addRecentItem({
      type: 'workspace',
      id: workspace.id,
      label: workspace.name,
      sublabel: `#${workspace.id}`,
    })
  }, [workspace.id, workspace.name, addRecentItem])

  const {
    data: grants,
    issueGrant,
    isIssuingGrant,
    revokeGrant,
    isRevokingGrant,
  } = useGrantsAdmin({ workspaceId: workspace.id })

  const { mutate: refetchLimits } = useWorkspaceLimitsAdmin({
    workspaceId: workspace.id,
  })

  const handleRevokeGrant = async (grant: Grant) => {
    if (isRevokingGrant) return
    const [_, error] = await revokeGrant({ grantId: grant.id })
    if (error) return
    refetchLimits()
    setOpenRevokeModal(false)
  }

  const handleIssueGrant = async (
    grantData: Parameters<typeof issueGrant>[0],
  ) => {
    const [_, error] = await issueGrant(grantData)
    if (error) return
    refetchLimits()
    setIsIssueGrantModalOpen(false)
  }

  const displayGrants = grants.length > 0 ? grants : workspace.grants
  const isFreePlan = FREE_PLANS.includes(workspace.subscription.plan)
  const isInTrial =
    isFreePlan &&
    workspace.subscription.trialEndsAt &&
    new Date(workspace.subscription.trialEndsAt) > new Date()

  const breadcrumbs = [{ label: 'Workspace', href: undefined }]

  return (
    <div className='container mx-auto p-6 max-w-7xl'>
      <div className='flex flex-col gap-8'>
        {/* Header */}
        <DashboardHeader
          title={workspace.name}
          description={`Workspace #${workspace.id}`}
          icon='house'
          breadcrumbs={breadcrumbs}
        />

        {/* Section 1: Quick Overview */}
        <Card className='p-6'>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-row items-center justify-between'>
              <div className='flex flex-row items-center gap-3'>
                <Badge
                  variant={
                    isInTrial ? 'warningMuted' : isFreePlan ? 'muted' : 'accent'
                  }
                >
                  {workspace.subscription.plan
                    .split('_')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')}
                </Badge>
                {workspace.subscription.trialEndsAt && (
                  <Text.H6 color='foregroundMuted'>
                    Trial {isInTrial ? 'ends' : 'ended'}{' '}
                    {new Date(
                      workspace.subscription.trialEndsAt,
                    ).toLocaleDateString()}
                  </Text.H6>
                )}
                <ChangeTrialEndDateButton
                  workspaceId={workspace.id}
                  currentTrialEndsAt={workspace.subscription.trialEndsAt}
                />
              </div>
              <ClickToCopy copyValue={String(workspace.id)}>
                <Text.H6 color='foregroundMuted' monospace>
                  ID: {workspace.id}
                </Text.H6>
              </ClickToCopy>
            </div>
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
              <StatCard
                icon='users'
                label='Members'
                value={workspace.users.length}
              />
              <StatCard
                icon='folderOpen'
                label='Projects'
                value={workspace.projects.length}
              />
              <StatCard
                icon='sparkles'
                label='Features'
                value={workspace.features.length}
              />
              <StatCard
                icon='calendar'
                label='Created'
                value={new Date(workspace.createdAt).toLocaleDateString()}
              />
            </div>
          </div>
        </Card>

        {/* Section 2: Billing & Subscription */}
        <Card className='p-6'>
          <div className='flex flex-col gap-6'>
            <SectionHeader
              icon='creditCard'
              title='Billing & Subscription'
              actions={
                <ChangePlanButton
                  workspaceId={workspace.id}
                  currentPlan={workspace.subscription.plan}
                />
              }
            />

            {/* Current Subscription */}
            <SubscriptionRow
              workspaceId={workspace.id}
              workspaceName={workspace.name}
              stripeCustomerId={workspace.stripeCustomerId}
              subscription={workspace.subscription}
            />

            {/* Usage Limits */}
            <div className='flex flex-col gap-4'>
              <Text.H5 color='foregroundMuted'>Usage Limits</Text.H5>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                <UsageLimitBar
                  label='Seats'
                  icon='users'
                  used={workspace.users.length}
                  limit={workspace.quotas.seats}
                />
                <UsageLimitBar
                  label='Runs'
                  icon='logs'
                  used={0}
                  limit={workspace.quotas.runs}
                />
                <UsageLimitBar
                  label='Credits'
                  icon='coins'
                  used={0}
                  limit={workspace.quotas.credits}
                />
              </div>
            </div>

            {/* Grants */}
            <div className='flex flex-col gap-4'>
              <div className='flex flex-row items-center justify-between'>
                <Text.H5 color='foregroundMuted'>
                  Resource Grants ({displayGrants.length})
                </Text.H5>
                <Button
                  variant='outline'
                  fancy
                  onClick={() => setIsIssueGrantModalOpen(true)}
                  disabled={isIssuingGrant}
                >
                  <div className='flex flex-row items-center gap-2'>
                    <Icon name='plus' size='small' />
                    <Text.H5>Issue Grant</Text.H5>
                  </div>
                </Button>
              </div>
              {displayGrants.length > 0 ? (
                <DataTable
                  title=''
                  count={displayGrants.length}
                  columns={[
                    { header: 'Type' },
                    { header: 'Amount' },
                    { header: 'Source' },
                    { header: 'Expires' },
                    { header: 'Actions' },
                  ]}
                  emptyMessage='No grants'
                  noCard
                >
                  {displayGrants.map((grant) => (
                    <TableRow key={grant.id}>
                      <TableCell className='p-2'>
                        <div className='flex flex-row items-center gap-2'>
                          <Icon
                            name={
                              grant.type === 'seats'
                                ? 'users'
                                : grant.type === 'runs'
                                  ? 'logs'
                                  : 'coins'
                            }
                            size='small'
                            color='foregroundMuted'
                          />
                          <Text.H5>
                            {grant.type.charAt(0).toUpperCase() +
                              grant.type.slice(1)}
                          </Text.H5>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-col'>
                          <Text.H5>
                            {grant.amount === 'unlimited'
                              ? 'Unlimited'
                              : grant.amount.toLocaleString()}
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
                        <Badge variant='muted' size='small'>
                          {grant.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Text.H5 color='foregroundMuted'>
                          {grant.expiresAt
                            ? new Date(grant.expiresAt).toLocaleDateString()
                            : 'Never'}
                        </Text.H5>
                      </TableCell>
                      <TableCell>
                        {grant.source !== GrantSource.Subscription && (
                          <Button
                            variant='destructive'
                            size='small'
                            onClick={() => {
                              setSelectedGrant(grant)
                              setOpenRevokeModal(true)
                            }}
                            disabled={isRevokingGrant}
                          >
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              ) : (
                <div className='py-4 text-center'>
                  <Text.H5 color='foregroundMuted'>No grants issued</Text.H5>
                </div>
              )}
            </div>

            {/* Subscription History (Collapsible) */}
            {workspace.subscriptions.length > 1 && (
              <details className='group'>
                <summary className='cursor-pointer list-none'>
                  <div className='flex flex-row items-center gap-2'>
                    <Icon
                      name='chevronRight'
                      size='small'
                      color='foregroundMuted'
                      className='group-open:rotate-90 transition-transform'
                    />
                    <Text.H5 color='foregroundMuted'>
                      Subscription History ({workspace.subscriptions.length})
                    </Text.H5>
                  </div>
                </summary>
                <div className='mt-4'>
                  <DataTable
                    title=''
                    count={workspace.subscriptions.length}
                    columns={[
                      { header: 'Plan' },
                      { header: 'Status' },
                      { header: 'Started' },
                      { header: 'Ended' },
                    ]}
                    emptyMessage='No history'
                    noCard
                  >
                    {workspace.subscriptions.map((subscription, index) => {
                      const previousSubscription =
                        workspace.subscriptions[index - 1]
                      const endDate = previousSubscription
                        ? previousSubscription.createdAt
                        : null
                      const isCancelled = subscription.cancelledAt !== null

                      return (
                        <TableRow key={subscription.id}>
                          <TableCell className='p-2'>
                            <Badge variant='muted'>
                              {subscription.plan
                                .split('_')
                                .map(
                                  (w) => w.charAt(0).toUpperCase() + w.slice(1),
                                )
                                .join(' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                !endDate && !isCancelled
                                  ? 'successMuted'
                                  : 'muted'
                              }
                              size='small'
                            >
                              {!endDate && !isCancelled
                                ? 'Active'
                                : isCancelled
                                  ? 'Cancelled'
                                  : 'Ended'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Text.H5 color='foregroundMuted'>
                              {new Date(
                                subscription.createdAt,
                              ).toLocaleDateString()}
                            </Text.H5>
                          </TableCell>
                          <TableCell>
                            <Text.H5 color='foregroundMuted'>
                              {endDate
                                ? new Date(endDate).toLocaleDateString()
                                : '-'}
                            </Text.H5>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </DataTable>
                </div>
              </details>
            )}
          </div>
        </Card>

        {/* Section 3: Team & Access */}
        <Card className='p-6'>
          <div className='flex flex-col gap-6'>
            <SectionHeader icon='users' title='Team & Access' />

            {/* Users */}
            <DataTable
              title={`Members (${workspace.users.length})`}
              count={workspace.users.length}
              columns={[
                { header: 'User' },
                { header: 'Actions', flex: 'w-32' },
              ]}
              emptyMessage='No members'
              noCard
            >
              {workspace.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className='p-2'>
                    <div className='flex flex-row items-center gap-3'>
                      <div className='p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg'>
                        <Icon
                          name='circleUser'
                          size='small'
                          color='foreground'
                        />
                      </div>
                      <div className='flex flex-col'>
                        <Text.H5 monospace>{user.email}</Text.H5>
                        {user.name && (
                          <Text.H6 color='foregroundMuted'>{user.name}</Text.H6>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={ROUTES.backoffice[BackofficeRoutes.search].user(
                        user.email,
                      )}
                    >
                      <Button variant='outline' size='small'>
                        View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>

            {/* Feature Flags */}
            {workspace.features.length > 0 && (
              <div className='flex flex-col gap-3'>
                <Text.H5 color='foregroundMuted'>
                  Feature Flags ({workspace.features.length})
                </Text.H5>
                <div className='flex flex-row flex-wrap gap-2'>
                  {workspace.features.map((feature) => (
                    <Badge key={feature.id} variant='accent'>
                      {feature.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Section 4: Content */}
        <Card className='p-6'>
          <div className='flex flex-col gap-6'>
            <SectionHeader icon='folderOpen' title='Projects' />

            <DataTable
              title={`Projects (${workspace.projects.length})`}
              count={workspace.projects.length}
              columns={[
                { header: 'Project' },
                { header: 'Actions', flex: 'w-32' },
              ]}
              emptyMessage='No projects'
              noCard
            >
              {workspace.projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className='p-2'>
                    <div className='flex flex-row items-center gap-3'>
                      <div className='p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg'>
                        <Icon
                          name='folderOpen'
                          size='small'
                          color='foreground'
                        />
                      </div>
                      <div className='flex flex-row items-center gap-2'>
                        <Text.H6 color='foregroundMuted' monospace>
                          #{project.id}
                        </Text.H6>
                        <Text.H5>{project.name}</Text.H5>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={ROUTES.backoffice[BackofficeRoutes.search].project(
                        project.id,
                      )}
                    >
                      <Button variant='outline' size='small'>
                        View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>
          </div>
        </Card>

        {/* Section 5: Workers Usage */}
        <WorkspaceWorkersUsage workspaceId={workspace.id} />

        {/* Section 6: Admin Tools */}
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
                <BigAccountBanner
                  workspaceId={workspace.id}
                  isBigAccount={workspace.isBigAccount}
                />

                <ProductAccessToggles
                  workspaceId={workspace.id}
                  promptManagerEnabled={workspace.promptManagerEnabled}
                  agentBuilderEnabled={workspace.agentBuilderEnabled}
                />

                <div className='flex flex-row items-center justify-between p-4 bg-muted/30 rounded-lg'>
                  <div className='flex flex-col gap-1'>
                    <Text.H5>Send Weekly Email</Text.H5>
                    <Text.H6 color='foregroundMuted'>
                      Trigger the weekly summary email for this workspace
                    </Text.H6>
                  </div>
                  <Button
                    variant='outline'
                    size='small'
                    onClick={() => setIsWeeklyEmailModalOpen(true)}
                  >
                    Send Email
                  </Button>
                </div>

                <div className='flex flex-row items-center justify-between p-4 bg-muted/30 rounded-lg'>
                  <div className='flex flex-col gap-1'>
                    <Text.H5>Clear Cache</Text.H5>
                    <Text.H6 color='foregroundMuted'>
                      Clear all cached data for this workspace
                    </Text.H6>
                  </div>
                  <ClearCacheButton workspaceId={workspace.id} />
                </div>

                <div className='flex flex-row items-center justify-between p-4 bg-destructive/10 border border-destructive/30 rounded-lg'>
                  <div className='flex flex-col gap-1'>
                    <Text.H5 color='destructive'>Delete Workspace</Text.H5>
                    <Text.H6 color='foregroundMuted'>
                      Permanently delete this workspace and all associated data
                    </Text.H6>
                  </div>
                  <DeleteWorkspaceButton
                    workspaceId={workspace.id}
                    workspaceName={workspace.name}
                  />
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Modals */}
        <IssueGrantModal
          open={isIssueGrantModalOpen}
          onOpenChange={setIsIssueGrantModalOpen}
          onIssueGrant={handleIssueGrant}
          isLoading={isIssuingGrant}
        />

        <WeeklyEmailModal
          open={isWeeklyEmailModalOpen}
          onOpenChange={setIsWeeklyEmailModalOpen}
          workspaceId={workspace.id}
        />

        {openRevokeModal && !!selectedGrant && (
          <ConfirmModal
            dismissible
            open={openRevokeModal}
            title={`Revoke ${selectedGrant.type} grant`}
            type='destructive'
            onOpenChange={setOpenRevokeModal}
            onConfirm={() => handleRevokeGrant(selectedGrant)}
            onCancel={() => setOpenRevokeModal(false)}
            confirm={{
              label: isRevokingGrant ? 'Revoking...' : 'Revoke Grant',
              description: `Are you sure you want to revoke this ${selectedGrant.type} grant? This action cannot be undone.`,
              disabled: isRevokingGrant,
              isConfirming: isRevokingGrant,
            }}
          />
        )}
      </div>
    </div>
  )
}
