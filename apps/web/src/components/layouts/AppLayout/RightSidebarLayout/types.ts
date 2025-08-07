import type { IconName } from '@latitude-data/web-ui/atoms/Icons'
import type { ReactNode } from 'react'

export type RightSidebarTabs = 'docs' | 'latte'

export type RightSidebarItem = {
  label: string
  value: RightSidebarTabs
  icon:
    | IconName
    | (({ isSelected, onClick }: { isSelected: boolean; onClick: () => void }) => ReactNode)
  content: ReactNode

  onSelect?: () => void
  onUnselect?: () => void
}
