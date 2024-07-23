import {
  ChevronDown,
  ChevronRight,
  Copy,
  EllipsisVertical,
  File,
  FolderClosed,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react'

import { type TextColor } from '$ui/ds/tokens'

import { LatitudeLogo, LatitudeLogoMonochrome } from './custom-icons'

export type Icon = LucideIcon
export type IconProps = {
  color?: TextColor
  widthClass?: string
  heightClass?: string
}

export const Icons = {
  logo: LatitudeLogo,
  logoMonochrome: LatitudeLogoMonochrome,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  folderClose: FolderClosed,
  file: File,
  folderOpen: FolderOpen,
  clipboard: Copy,
  ellipsisVertical: EllipsisVertical,
}
