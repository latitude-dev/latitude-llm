import {
  TabSelector as OriginalTabSelector,
  TabSelectorProps,
} from '@latitude-data/web-ui/molecules/TabSelector'
import Link from 'next/link'

export function TabSelector<T extends string>({
  ...props
}: Omit<TabSelectorProps<T>, 'linkWrapper'>) {
  return <OriginalTabSelector {...props} linkWrapper={Link} />
}
