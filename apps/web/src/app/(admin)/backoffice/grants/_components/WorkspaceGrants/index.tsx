'use client'

import { DataTable } from '$/app/(admin)/backoffice/search/_components/DataTable'
import { useGrantsAdmin } from '$/stores/admin/grants'
import { useWorkspaceLimitsAdmin } from '$/stores/admin/workspaceLimits'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Card, CardContent, CardHeader } from '@latitude-data/web-ui/atoms/Card'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { useState } from 'react'
import { IssueGrantModal } from '../IssueGrantModal'
import { Grant } from '@latitude-data/constants/grants'
import { GrantSource } from '@latitude-data/core/constants'

export function WorkspaceGrants({ workspaceId }: { workspaceId: number }) {
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false)
  const [openRevokeModal, setOpenRevokeModal] = useState(false)
  const [selectedGrant, setSelectedGrant] = useState<Grant>()

  const {
    data: grants,
    isLoading: isLoadingGrants,
    issueGrant,
    isIssuingGrant,
    revokeGrant,
    isRevokingGrant,
  } = useGrantsAdmin({ workspaceId })

  const {
    data: limits,
    isLoading: isLoadingLimits,
    mutate: refetchLimits,
  } = useWorkspaceLimitsAdmin({ workspaceId })

  const handleRevokeGrant = async (grant: Grant) => {
    if (isRevokingGrant) return
    const [_, error] = await revokeGrant({ grantId: grant.id })
    if (error) return
    refetchLimits()
    setOpenRevokeModal(false)
  }

  const handleIssueGrant = async (grant: Parameters<typeof issueGrant>[0]) => {
    const [_, error] = await issueGrant(grant)
    if (error) return
    refetchLimits()
    setIsIssueModalOpen(false)
  }

  return (
    <div className='space-y-8'>
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <span className='flex items-center justify-center gap-2'>
            <Text.H3>Grants</Text.H3>
            {!!limits?.resetsAt && (
              <Text.H5 color='foregroundMuted'>
                Resets at {new Date(limits.resetsAt).toLocaleDateString()}
              </Text.H5>
            )}
          </span>
          <Button onClick={() => setIsIssueModalOpen(true)} fancy>
            Issue Grant
          </Button>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <Text.H5 color='foregroundMuted'>Seats</Text.H5>
              <Icon name='users' color='primary' />
            </CardHeader>
            <CardContent>
              <div className='space-y-1'>
                <Text.H1 color='foreground'>
                  {isLoadingLimits
                    ? 'Loading...'
                    : (limits?.seats ?? 0).toLocaleString()}
                </Text.H1>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <Text.H5 color='foregroundMuted'>Runs</Text.H5>
              <Icon name='logs' color='primary' />
            </CardHeader>
            <CardContent>
              <div className='space-y-1'>
                <Text.H1 color='foreground'>
                  {isLoadingLimits
                    ? 'Loading...'
                    : (limits?.runs ?? 0).toLocaleString()}
                </Text.H1>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <Text.H5 color='foregroundMuted'>Credits</Text.H5>
              <Icon name='coins' color='primary' />
            </CardHeader>
            <CardContent>
              <div className='space-y-1'>
                <Text.H1 color='foreground'>
                  {isLoadingLimits
                    ? 'Loading...'
                    : (limits?.credits ?? 0).toLocaleString()}
                </Text.H1>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className='space-y-4'>
        {isLoadingGrants ? (
          <div className='flex items-center justify-center py-8'>
            <Text.H5 color='foregroundMuted'>Loading grants...</Text.H5>
          </div>
        ) : grants.length === 0 ? (
          <div className='flex items-center justify-center py-8'>
            <Text.H5 color='foregroundMuted'>
              This workspace has no grants
            </Text.H5>
          </div>
        ) : (
          <DataTable
            title='Grants'
            count={grants.length}
            columns={[
              { header: 'Type' },
              { header: 'Amount' },
              { header: 'Source' },
              { header: 'Expires At' },
              { header: 'Granted At' },
              { header: 'Actions' },
            ]}
            emptyMessage='No grants found'
            icon='circleGauge'
          >
            {grants.map((grant) => (
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
                      fancy
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        )}
      </div>
      <IssueGrantModal
        open={isIssueModalOpen}
        onOpenChange={setIsIssueModalOpen}
        onIssueGrant={handleIssueGrant}
        isLoading={isIssuingGrant}
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
            description: `Are you sure you want to revoke this ${selectedGrant.type} grant? This action cannot be undone and will immediately remove ${selectedGrant.amount === 'unlimited' ? 'unlimited' : selectedGrant.amount.toLocaleString()} ${selectedGrant.type} from the workspace.`,
            disabled: isRevokingGrant,
            isConfirming: isRevokingGrant,
          }}
        />
      )}
    </div>
  )
}
