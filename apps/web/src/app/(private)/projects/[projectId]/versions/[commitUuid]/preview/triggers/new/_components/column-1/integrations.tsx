'use client'

import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Image from 'next/image'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { useColumn1Context } from '../contexts/column-1-context'
import { useTriggersModalContext } from '../contexts/triggers-modal-context'
import { IntegrationType } from '@latitude-data/constants'
import { cn } from '@latitude-data/web-ui/utils'

export function Integrations() {
  const { pipedreamApps, isLoading } = useColumn1Context()
  const { selectedIntegration, setSelectedIntegration } =
    useTriggersModalContext()

  return (
    <div className='flex flex-col gap-2'>
      <Text.H5M>Integrations</Text.H5M>
      {isLoading ? (
        <TableSkeleton cols={1} rows={4} verticalPadding />
      ) : (
        <div className='w-full overflow-hidden'>
          <Table className='w-full table-fixed'>
            <TableBody>
              {pipedreamApps.map((app) => (
                <TableRow
                  key={app.id}
                  className={cn('cursor-pointer', {
                    'bg-accent':
                      selectedIntegration?.name === app.name &&
                      !selectedIntegration?.id,
                  })}
                  onClick={() =>
                    setSelectedIntegration({
                      name: app.name,
                      type: IntegrationType.Pipedream,
                      pipedream: {
                        app: {
                          name: app.name,
                        },
                      },
                    })
                  }
                  verticalPadding
                >
                  <TableCell className='p-0 pl-2 w-12'>
                    <div className='flex items-center justify-center w-full'>
                      <Image
                        src={app.img_src}
                        alt={app.name}
                        width={40}
                        height={40}
                        className='rounded'
                        unoptimized
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col gap-1 max-w-full'>
                      <Text.H4M>{app.name}</Text.H4M>
                      <div className='truncate'>
                        <Text.H5 noWrap color='foregroundMuted'>
                          {app.description || 'No description'}
                        </Text.H5>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className='p-0 pr-2 w-6'>
                    <div className='flex items-center justify-center w-full'>
                      <Icon name='arrowRight' color='foregroundMuted' />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
