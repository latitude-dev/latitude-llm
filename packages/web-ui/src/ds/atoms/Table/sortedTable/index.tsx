import { ReactNode } from 'react'
import { TableHead } from '..'
import { Icon } from '../../Icons'
import { Text } from '../../Text'

type SortDirection = 'asc' | 'desc' | null

interface SortableTableHeadProps {
  children: ReactNode
  sortDirection: SortDirection
  onSort: () => void
}

const SortableTableHead = ({
  children,
  sortDirection,
  onSort,
}: SortableTableHeadProps) => {
  const getSortIcon = () => {
    if (sortDirection === 'asc') return 'arrowUp'
    if (sortDirection === 'desc') return 'arrowDown'
    return 'arrowDownUp'
  }

  return (
    <TableHead
      className='cursor-pointer hover:bg-secondary/50 transition-colors'
      onClick={onSort}
    >
      <div className='flex items-center gap-2'>
        <Text.H5M noWrap>{children}</Text.H5M>
        <Icon name={getSortIcon()} size='small' color='foregroundMuted' />
      </div>
    </TableHead>
  )
}

export { SortableTableHead, type SortDirection }
