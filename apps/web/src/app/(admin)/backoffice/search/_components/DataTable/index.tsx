import { ReactNode } from 'react'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type Column = {
  header: string
  flex?: string
}

type Props = {
  title: string
  count: number
  columns: Column[]
  children: ReactNode
  emptyMessage?: string
  icon?: IconName
  className?: string
}

export function DataTable({
  title,
  count,
  columns,
  children,
  emptyMessage = 'No items found',
  icon,
  className,
}: Props) {
  return (
    <Card className={`space-y-4 ${className || ''}`}>
      <div className='flex items-center justify-between p-6 pb-4'>
        <div className='flex items-center space-x-3'>
          {icon && (
            <div className='p-2 bg-primary/10 rounded-lg'>
              <Icon name={icon} size='medium' color='primary' />
            </div>
          )}
          <div className='flex flex-col'>
            <span>{title}</span>
            <div className='flex items-center justify-start'>
              <Badge variant={count > 0 ? 'default' : 'secondary'} size='small'>
                {count} {count === 1 ? 'item' : 'items'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {count === 0 ? (
        <div className='px-6 pb-6'>
          <div className='flex flex-col items-center justify-center py-12 text-center'>
            <div className='p-4 bg-muted/30 rounded-full mb-4'>
              <Icon name='fileQuestion' size='large' color='foregroundMuted' />
            </div>
            <Text.H4 color='foregroundMuted'>{emptyMessage}</Text.H4>
            <Text.H5 color='foregroundMuted'>
              No data to display at the moment.
            </Text.H5>
          </div>
        </div>
      ) : (
        <div className='px-6 pb-6'>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column, index) => (
                  <TableHead key={index} className={column.flex}>
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>{children}</TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}
