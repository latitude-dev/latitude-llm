'use client'

import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  TableWithHeader,
  TableBlankSlate,
  Text,
  DropdownMenu,
  DotIndicator,
  ClickToCopy,
} from '@latitude-data/web-ui'
import { useRouter } from 'next/navigation'
import useWebhooks, { type Webhook } from '$/stores/webhooks'
import useProjects from '$/stores/projects'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

export default function Webhooks() {
  const router = useRouter()
  const { data: webhooks, isLoading } = useWebhooks()
  const { data: projects } = useProjects()

  const handleDelete = (webhook: Webhook) => {
    router.push(`/settings/webhooks/${webhook.id}/destroy`)
  }

  const handleEdit = (webhook: Webhook) => {
    router.push(`/settings/webhooks/${webhook.id}/edit`)
  }

  const getProjectNames = (projectIds?: number[] | null) => {
    if (!projectIds?.length) return 'All projects'

    const projectNames = projectIds
      .map((id) => projects?.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(', ')

    return projectNames.length > 50
      ? `${projectNames.slice(0, 47)}...`
      : projectNames
  }

  const renderTable = () => {
    if (isLoading) {
      return <TableSkeleton cols={6} rows={3} />
    }

    if (!webhooks?.length) {
      return (
        <TableBlankSlate
          description='There are no webhooks yet. Create one to start receiving notifications.'
          link={
            <Link href={ROUTES.settings.webhooks.new.root}>
              <Button fancy>Create webhook</Button>
            </Link>
          }
        />
      )
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Secret</TableHead>
            <TableHead>Projects</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {webhooks.map((webhook) => (
            <TableRow key={webhook.id} verticalPadding hoverable={false}>
              <TableCell>
                <Text.H5>{webhook.name}</Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5 color='foregroundMuted'>{webhook.url}</Text.H5>
              </TableCell>
              <TableCell>
                <ClickToCopy
                  tooltipContent='Click to copy the webhook secret'
                  copyValue={webhook.secret}
                >
                  <Text.H5 color='foregroundMuted'>••••••••</Text.H5>
                </ClickToCopy>
              </TableCell>
              <TableCell>
                <Text.H5 ellipsis color='foregroundMuted'>
                  {getProjectNames(webhook.projectIds)}
                </Text.H5>
              </TableCell>
              <TableCell>
                <div className='flex items-center gap-2'>
                  <DotIndicator
                    variant={webhook.isActive ? 'success' : 'muted'}
                    size='default'
                    pulse={webhook.isActive}
                  />
                  <Text.H5 color='foregroundMuted'>
                    {webhook.isActive ? 'Active' : 'Inactive'}
                  </Text.H5>
                </div>
              </TableCell>
              <TableCell align='right'>
                <DropdownMenu
                  options={[
                    {
                      label: 'Edit',
                      onClick: () => handleEdit(webhook),
                    },
                    {
                      label: 'Delete',
                      onClick: () => handleDelete(webhook),
                      type: 'destructive',
                    },
                  ]}
                  side='bottom'
                  align='end'
                  triggerButtonProps={{
                    className: 'border-none justify-end cursor-pointer',
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <>
      <TableWithHeader
        title='Webhooks'
        actions={
          <Link href={ROUTES.settings.webhooks.new.root}>
            <Button fancy variant='outline'>
              Create webhook
            </Button>
          </Link>
        }
        table={renderTable()}
      />
    </>
  )
}
