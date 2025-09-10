'use client'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ROUTES } from '$/services/routes'
import useClaimedPromocodes from '$/stores/claimedPromocodes'
import Link from 'next/link'
import { OpenInDocsButton } from '$/components/Documentation/OpenInDocsButton'
import { DocsRoute } from '$/components/Documentation/routes'

export default function Promocodes() {
  const { data: claimedPromocodes, isLoading } = useClaimedPromocodes()
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-row items-center justify-between'>
        <div className='flex flex-row items-center gap-2'>
          <Text.H4B>Claimed Promocodes</Text.H4B>
          <OpenInDocsButton route={DocsRoute.Providers} />
        </div>
        <Link href={ROUTES.settings.promocodes.claim.root}>
          <Button fancy variant='outline'>
            Claim promocode
          </Button>
        </Link>
      </div>
      <div className='flex flex-col gap-2'>
        {isLoading ? (
          <TableSkeleton cols={1} rows={1} />
        ) : claimedPromocodes.length === 0 ? (
          <TableBlankSlate
            description='You have not claimed any promocodes yet. Claim one to get started.'
            link={
              <Link href={ROUTES.settings.promocodes.claim.root}>
                <TableBlankSlate.Button>Claim promocode</TableBlankSlate.Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow verticalPadding>
                <TableHead>Code</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claimedPromocodes.map((promocode) => (
                <TableRow key={promocode.id} hoverable={false} verticalPadding>
                  <TableCell>
                    <Text.H5>{promocode.code}</Text.H5>
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap>
                      {promocode.amount} {promocode.quotaType}
                    </Text.H5>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
