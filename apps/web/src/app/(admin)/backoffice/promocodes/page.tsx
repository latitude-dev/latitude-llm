'use client'

import { usePromocodes } from '$/stores/admin/promocodes'
import { QuotaType } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
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
        return 'Credits'
      case QuotaType.Runs:
        return 'Runs'
      default:
        return type
    }
  }

  return (
    <div className='flex flex-row items-center gap-2'>
      <Icon name='gift' />
      <Text.H6>{getQuotaTypeLabel(quotaType)}</Text.H6>
    </div>
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
                    <Button
                      onClick={() =>
                        executeDeletePromocode({ code: promocode.code })
                      }
                      variant='destructive'
                      disabled={isDeletingPromocode}
                      iconProps={{
                        name: 'trash',
                        color: 'destructiveForeground',
                      }}
                    ></Button>
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
