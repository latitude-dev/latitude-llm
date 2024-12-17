import { Badge, Button, Icon } from '@latitude-data/web-ui'
import { CompletedSearch } from '../types'

type CompletedSearchBadgeProps = {
  search: CompletedSearch
  onRemove: () => void
}

export function CompletedSearchBadge({
  search,
  onRemove,
}: CompletedSearchBadgeProps) {
  return (
    <Badge variant='accent' className='shrink-0 flex items-center gap-1'>
      {search.column.label} {search.operator.label} {search.value}
      <Button variant='nope' onClick={onRemove}>
        <Icon name='close' size='small' color='primary' />
      </Button>
    </Badge>
  )
}
