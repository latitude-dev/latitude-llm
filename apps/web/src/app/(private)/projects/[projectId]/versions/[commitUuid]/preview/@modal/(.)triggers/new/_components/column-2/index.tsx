'use client'

import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { Table, TableBody, TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { useTriggersModalContext } from '../contexts/triggers-modal-context'
import { cn } from '@latitude-data/web-ui/utils'

export function Column2() {
  const {
    selectedPipedreamApp,
    isSelectedPipedreamAppLoading,
    selectedIntegration,
    setSelectedIntegration,
  } = useTriggersModalContext()

  if (!selectedIntegration?.pipedream?.app) return null
  if (isSelectedPipedreamAppLoading) {
    return (
      <div>
        <TableSkeleton cols={1} rows={12} verticalPadding />
      </div>
    )
  }

  if (!selectedPipedreamApp?.triggers.length) {
    return (
      <div className='flex flex-col items-center p-4 pt-8 h-full gap-4 rounded-lg border'>
        <Text.H5 color='foregroundMuted'>This integration has no triggers</Text.H5>
      </div>
    )
  }

  return (
    <div className='w-full h-full custom-scrollbar pb-4'>
      <Table className='w-full table-fixed'>
        <TableBody>
          {selectedPipedreamApp?.triggers?.map((trigger) => (
            <TableRow
              key={trigger.key}
              className={cn('cursor-pointer', {
                'bg-accent': selectedIntegration?.pipedream?.trigger?.key === trigger.key,
              })}
              onClick={() =>
                setSelectedIntegration({
                  ...selectedIntegration,
                  pipedream: {
                    app: selectedIntegration.pipedream!.app,
                    trigger,
                  },
                })
              }
              verticalPadding
            >
              <TableCell className='p-0 pl-2 w-12'>
                <div className='flex items-center justify-center w-full'>
                  <Icon name='zap' color='foregroundMuted' />
                </div>
              </TableCell>
              <TableCell>
                <div className='flex flex-col gap-1 max-w-full'>
                  <Text.H4M>{trigger.name}</Text.H4M>
                  <div className='truncate'>
                    <Text.H5 ellipsis noWrap color='foregroundMuted'>
                      {trigger.description || 'No description'}
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
  )
}
