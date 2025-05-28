import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { ReactNode } from 'react'

export type RightSidebarTabs = 'docs'

export type RightSidebarItem = {
  label: string
  value: RightSidebarTabs
  icon:
    | IconName
    | (({
        isSelected,
        onClick,
      }: {
        isSelected: boolean
        onClick: () => void
      }) => ReactNode)
  content: ReactNode
}
