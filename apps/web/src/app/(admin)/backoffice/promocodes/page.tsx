'use client'

import { usePromocodes } from '$/stores/admin/promocodes'
import { QuotaType } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useState } from 'react'
import CreatePromocodeModal from './_components/CreatePromocodeModal/createPromocodeModal'

function QuotaTypeCell({ quotaType }: { quotaType: QuotaType }) {
  const getQuotaTypeLabel = (type: QuotaType) => {
    switch (type) {
      case QuotaType.Credits:
        return 'coins'
      case QuotaType.Runs:
        return 'rotate'
      default:
        return 'accessibility'
    }
  }

  return (
    <div className='flex flex-row items-center gap-2'>
      <Icon name={getQuotaTypeLabel(quotaType)} />
      <Text.H5>{quotaType}</Text.H5>
    </div>
  )
}

function ActionsCell({
  promocode,
  onDelete,
  onExpire,
  isDeleting,
  isExpiring,
}: {
  promocode: any
  onDelete: (code: string) => void
  onExpire: (code: string) => void
  isDeleting: boolean
  isExpiring: boolean
}) {
  const isExpired = !!promocode.cancelledAt

  return (
    <Popover.Root>
      <Popover.ButtonTrigger
        buttonVariant='ghost'
        iconProps={{ name: 'ellipsis' }}
      >
        {''}
      </Popover.ButtonTrigger>
      <Popover.Content size='small'>
        <div className='flex flex-col gap-1'>
          {!isExpired && (
            <Button
              variant='ghost'
              size='small'
              onClick={() => onExpire(promocode.code)}
              disabled={isExpiring}
              className='justify-start'
            >
              <Icon name='clock' className='mr-2' />
              Expire
            </Button>
          )}
          <Button
            variant='ghost'
            size='small'
            onClick={() => onDelete(promocode.code)}
            disabled={isDeleting}
            className='justify-start'
          >
            <Icon name='trash' className='mr-2' />
            Delete
          </Button>
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}

export default function PromocodesPage() {
  const [isCreatePromocodeModalOpen, setIsCreatePromocodeModalOpen] =
    useState(false)

  const {
    data: promocodes,
    isLoading,
    error,
    executeCreatePromocode,
    isCreatingPromocode,
    executeDeletePromocode,
    isDeletingPromocode,
    executeExpirePromocode,
    isExpiringPromocode,
  } = usePromocodes(setIsCreatePromocodeModalOpen)

  if (isLoading) {
    return (
      <div className='w-full max-w-[1250px] m-auto px-4 py-8 pt-0 flex flex-col gap-8'>
        <Text.H1>Promocodes</Text.H1>
        <Text.H4 color='foregroundMuted'>Loading promocodes...</Text.H4>
      </div>
    )
  }

  if (error) {
    return (
      <div className='w-full max-w-[1250px] m-auto px-4 py-8 pt-0 flex flex-col gap-8'>
        <Text.H1>Promocodes</Text.H1>
        <Text.H4 color='destructive'>
          Error loading promocodes: {error.message}
        </Text.H4>
      </div>
    )
  }

  return (
    <div className='w-full max-w-[1250px] m-auto px-4 py-8 pt-0 flex flex-col gap-8'>
      <div className='flex flex-row gap-2 justify-between items-center'>
        <div className='flex flex-col gap-2'>
          <Text.H1>Promocodes</Text.H1>
          <Text.H4 color='foregroundMuted'>
            View all active promocodes in production
          </Text.H4>
        </div>
        <Button
          onClick={() => setIsCreatePromocodeModalOpen(true)}
          className='w-fit'
          fancy
          iconProps={{ name: 'gift', placement: 'left' }}
          disabled={isCreatingPromocode}
        >
          Create Promocode
        </Button>
        <CreatePromocodeModal
          isCreatePromocodeModalOpen={isCreatePromocodeModalOpen}
          setIsCreatePromocodeModalOpen={setIsCreatePromocodeModalOpen}
          executeCreatePromocode={executeCreatePromocode}
        />
      </div>
      <TableWithHeader
        title={`Active promocodes (${promocodes.length})`}
        table={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Quota Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promocodes.map((promocode) => (
                <TableRow
                  key={promocode.id}
                  className='border-b-[0.5px] h-12 max-h-12 border-border'
                >
                  <TableCell>
                    <ClickToCopy copyValue={promocode.code}>
                      <Text.H5 noWrap ellipsis color='accentForeground'>
                        {promocode.code}
                      </Text.H5>
                    </ClickToCopy>
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap ellipsis>
                      {promocode.description || 'No description'}
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <QuotaTypeCell quotaType={promocode.quotaType} />
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap>
                      {promocode.amount.toLocaleString()}
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap>
                      {new Date(promocode.createdAt).toLocaleDateString()}
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap>
                      {new Date(promocode.updatedAt).toLocaleDateString()}
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      {promocode.cancelledAt ? (
                        <>
                          <Icon name='clock' className='text-destructive' />
                          <Text.H5 color='destructive'>Expired</Text.H5>
                        </>
                      ) : (
                        <>
                          <Icon name='check' className='text-green-500' />
                          <Text.H5 color='success'>Active</Text.H5>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ActionsCell
                      promocode={promocode}
                      onDelete={(code) => executeDeletePromocode({ code })}
                      onExpire={(code) => executeExpirePromocode({ code })}
                      isDeleting={isDeletingPromocode}
                      isExpiring={isExpiringPromocode}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      />
    </div>
  )
}
